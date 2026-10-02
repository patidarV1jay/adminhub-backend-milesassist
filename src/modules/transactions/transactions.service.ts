import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma, TransactionStage, TransactionStatus, TransactionType } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { paginated, skipTake, toPrismaOrder } from '../../common/utils/pagination.util';
import { buildDateRange } from '../../common/utils/date-range.util';
import { toCsv } from '../../common/utils/csv.util';
import { formatRef, parseRef } from '../../common/utils/reference.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionsDto, TransactionSortField } from './dto/query-transactions.dto';
import { RefundTransactionDto } from './dto/refund-transaction.dto';
import { TransactionStatsQueryDto } from './dto/stats-query.dto';
import { UpdateTransactionStatusDto } from './dto/update-transaction-status.dto';
import {
  paymentMethodLabel,
  toCustomer,
  toTransactionListItem,
  transactionListInclude,
  transactionUserSelect,
} from './transactions.mapper';

const DAY = 86_400_000;
const EXPORT_LIMIT = 10_000;

const TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  [TransactionStatus.PENDING]: [TransactionStatus.COMPLETED, TransactionStatus.FAILED],
  [TransactionStatus.FAILED]: [TransactionStatus.PENDING],
  [TransactionStatus.COMPLETED]: [],
  [TransactionStatus.REFUNDED]: [],
};

const BOOKING_PAYMENT: Record<TransactionStatus, PaymentStatus> = {
  [TransactionStatus.PENDING]: PaymentStatus.PENDING,
  [TransactionStatus.COMPLETED]: PaymentStatus.PAID,
  [TransactionStatus.FAILED]: PaymentStatus.FAILED,
  [TransactionStatus.REFUNDED]: PaymentStatus.REFUNDED,
};

type EventInput = Prisma.TransactionEventCreateWithoutTransactionInput;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryTransactionsDto) {
    const where = this.buildWhere(query);
    const { page, limit } = query;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        orderBy: this.buildOrderBy(query),
        include: transactionListInclude,
        ...skipTake(page, limit),
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return paginated(rows.map(toTransactionListItem), total, page, limit);
  }

  async exportCsv(query: QueryTransactionsDto): Promise<string> {
    const rows = await this.prisma.transaction.findMany({
      where: this.buildWhere(query),
      orderBy: this.buildOrderBy(query),
      include: transactionListInclude,
      take: EXPORT_LIMIT,
    });

    return toCsv(
      ['Transaction ID', 'Customer', 'Email', 'Type', 'Amount', 'Currency', 'Status', 'Payment Method', 'Date (UTC)'],
      rows.map((t) => [
        formatRef('TXN', t.number),
        t.user.name,
        t.user.email,
        t.type,
        t.amount.toFixed(2),
        t.currency,
        t.status,
        paymentMethodLabel(t),
        t.createdAt.toISOString(),
      ]),
    );
  }

  async stats(query: TransactionStatsQueryDto) {
    const createdAt = buildDateRange(query.dateFrom, query.dateTo);
    const base: Prisma.TransactionWhereInput = { createdAt };
    const moves: Prisma.TransactionWhereInput = {
      ...base,
      type: { in: [TransactionType.PAYMENT, TransactionType.TRANSFER] },
    };

    const [totalTransactions, volume, completedCount, succeeded, failed] = await Promise.all([
      this.prisma.transaction.count({ where: base }),
      this.prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...moves, status: TransactionStatus.COMPLETED },
      }),
      this.prisma.transaction.count({ where: { ...moves, status: TransactionStatus.COMPLETED } }),
      this.prisma.transaction.count({
        where: { ...moves, status: { in: [TransactionStatus.COMPLETED, TransactionStatus.REFUNDED] } },
      }),
      this.prisma.transaction.count({ where: { ...moves, status: TransactionStatus.FAILED } }),
    ]);

    const totalVolume = volume._sum.amount?.toNumber() ?? 0;
    const resolved = succeeded + failed; // pending transactions are not decided yet

    return {
      totalTransactions,
      totalVolume: round2(totalVolume),
      averageTransaction: completedCount > 0 ? round2(totalVolume / completedCount) : 0,
      successRate: resolved > 0 ? round1((succeeded / resolved) * 100) : 0,
      successRateTrend: await this.successRateTrend(),
    };
  }

  private async successRateTrend() {
    const since = new Date(Date.now() - 14 * DAY);
    const rows = await this.prisma.$queryRaw<{ day: Date; ok: bigint; failed: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day,
             COUNT(*) FILTER (WHERE "status" IN ('COMPLETED', 'REFUNDED')) AS ok,
             COUNT(*) FILTER (WHERE "status" = 'FAILED') AS failed
      FROM "Transaction"
      WHERE "type" <> 'REFUND' AND "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1`;

    return rows
      .map((r) => ({ date: r.day, ok: Number(r.ok), failed: Number(r.failed) }))
      .filter((r) => r.ok + r.failed > 0)
      .map((r) => ({ date: r.date, successRate: round1((r.ok / (r.ok + r.failed)) * 100) }));
  }

  async findOne(id: string) {
    const t = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        user: { select: transactionUserSelect },
        booking: { select: { id: true, number: true } },
        originalTransaction: { select: { id: true, number: true } },
        refunds: { select: { id: true, number: true, amount: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
        events: { orderBy: { occurredAt: 'desc' } },
      },
    });
    if (!t) throw new NotFound();

    const related = await this.prisma.transaction.findMany({
      where: { userId: t.userId, id: { not: t.id } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        events: {
          where: { stage: TransactionStage.COMPLETED },
          orderBy: { occurredAt: 'desc' },
          take: 1,
          select: { occurredAt: true },
        },
      },
    });

    return {
      id: t.id,
      reference: formatRef('TXN', t.number),
      gatewayReference: t.gatewayReference,
      type: t.type,
      status: t.status,
      currency: t.currency,
      generatedAt: t.createdAt,
      updatedAt: t.updatedAt,
      canRefund: t.type === TransactionType.PAYMENT && t.status === TransactionStatus.COMPLETED,
      invoice: {
        transactionType: t.description ?? t.type,
        paymentMethod: paymentMethodLabel(t),
        gatewayFee: t.gatewayFee.toNumber(),
        subtotal: t.subtotal.toNumber(),
        grandTotal: t.amount.toNumber(),
      },
      customer: toCustomer(t.user),
      booking: t.booking ? { id: t.booking.id, reference: formatRef('BKG', t.booking.number) } : null,
      originalTransaction: t.originalTransaction
        ? { id: t.originalTransaction.id, reference: formatRef('TXN', t.originalTransaction.number) }
        : null,
      refunds: t.refunds.map((r) => ({
        id: r.id,
        reference: formatRef('TXN', r.number),
        amount: r.amount.toNumber(),
        createdAt: r.createdAt,
      })),
      processingHistory: t.events.map((e) => ({
        id: e.id,
        stage: e.stage,
        title: e.title,
        description: e.description,
        occurredAt: e.occurredAt,
      })),
      relatedEntries: related.map((r) => ({
        id: r.id,
        reference: formatRef('TXN', r.number),
        paymentMethod: paymentMethodLabel(r),
        amount: r.amount.toNumber(),
        status: r.status,
        settledAt: r.events[0]?.occurredAt ?? null,
      })),
    };
  }

  async create(dto: CreateTransactionDto, actor: AuthUser) {
    const customer = await this.prisma.user.findFirst({
      where: { id: dto.userId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    if (dto.bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: dto.bookingId },
        select: { id: true, customerId: true },
      });
      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.customerId !== dto.userId) {
        throw new BadRequestException('This booking belongs to a different customer');
      }
    }

    const status = dto.status ?? TransactionStatus.PENDING;
    const subtotal = new Prisma.Decimal(dto.subtotal);
    const gatewayFee = new Prisma.Decimal(dto.gatewayFee ?? 0);

    const created = await this.prisma.$transaction(async (tx) => {
      const t = await tx.transaction.create({
        data: {
          userId: dto.userId,
          bookingId: dto.bookingId,
          type: dto.type ?? TransactionType.PAYMENT,
          status,
          subtotal,
          gatewayFee,
          amount: subtotal.plus(gatewayFee), 
          currency: dto.currency ?? 'USD',
          paymentMethod: dto.paymentMethod,
          cardBrand: dto.cardBrand,
          cardLast4: dto.cardLast4,
          description: dto.description,
          gatewayReference: dto.gatewayReference,
          events: { create: this.initialEvents(status) },
        },
      });
      if (dto.bookingId) await this.syncBookingPayment(tx, dto.bookingId, status);
      await tx.activityLog.create({
        data: {
          userId: dto.userId,
          action: `Created transaction ${formatRef('TXN', t.number)}`,
          description: `Created by ${actor.name}`,
          metadata: { by: actor.id, transactionId: t.id },
        },
      });
      return t;
    });

    return this.findOne(created.id);
  }

  async updateStatus(id: string, dto: UpdateTransactionStatusDto, actor: AuthUser) {
    if (dto.status === TransactionStatus.REFUNDED) {
      throw new BadRequestException('Use POST /transactions/:id/refund to refund a transaction');
    }

    const current = await this.prisma.transaction.findUnique({
      where: { id },
      select: { id: true, number: true, status: true, userId: true, bookingId: true },
    });
    if (!current) throw new NotFound();

    if (!TRANSITIONS[current.status].includes(dto.status)) {
      throw new ConflictException(`Cannot change status from ${current.status} to ${dto.status}`);
    }

    const ref = formatRef('TXN', current.number);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.transaction.updateMany({
        where: { id, status: current.status },
        data: { status: dto.status },
      });
      if (count === 0) throw new ConflictException('Transaction was modified by another request, please retry');

      const base = Date.now();
      const at = (i: number) => new Date(base + i * 1000);
      const events: EventInput[] = [];
      let action: string;

      if (dto.status === TransactionStatus.COMPLETED) {
        const authorized = await tx.transactionEvent.count({
          where: { transactionId: id, stage: TransactionStage.AUTHORIZED },
        });
        if (authorized === 0) {
          events.push({
            stage: TransactionStage.AUTHORIZED,
            title: 'Processing & Authorized',
            description: 'Gateway authorization approved',
            occurredAt: at(0),
          });
        }
        events.push({
          stage: TransactionStage.COMPLETED,
          title: 'Completed & Disbursed',
          description: dto.note ?? 'Settled in merchant bank account',
          occurredAt: at(1),
        });
        action = `Completed transaction ${ref}`;
      } else if (dto.status === TransactionStatus.FAILED) {
        events.push({
          stage: TransactionStage.FAILED,
          title: 'Payment failed',
          description: dto.note ?? 'Payment could not be processed',
          occurredAt: at(0),
        });
        action = `Transaction ${ref} failed`;
      } else {
        events.push({
          stage: TransactionStage.INITIATED,
          title: 'Retry initiated',
          description: dto.note ?? 'Payment retry started',
          occurredAt: at(0),
        });
        action = `Retried transaction ${ref}`;
      }

      await tx.transactionEvent.createMany({ data: events.map((e) => ({ ...e, transactionId: id })) });
      if (current.bookingId) await this.syncBookingPayment(tx, current.bookingId, dto.status);
      await tx.activityLog.create({
        data: {
          userId: current.userId,
          action,
          description: `Updated by ${actor.name}`,
          metadata: { by: actor.id, transactionId: id },
        },
      });
    });

    return this.findOne(id);
  }

  async refund(id: string, dto: RefundTransactionDto, actor: AuthUser) {
    const original = await this.prisma.transaction.findUnique({ where: { id } });
    if (!original) throw new NotFound();

    if (original.type !== TransactionType.PAYMENT) {
      throw new ConflictException('Only payments can be refunded');
    }
    if (original.status === TransactionStatus.REFUNDED) {
      throw new ConflictException('Transaction is already refunded');
    }
    if (original.status !== TransactionStatus.COMPLETED) {
      throw new ConflictException(`Cannot refund a ${original.status.toLowerCase()} transaction`);
    }

    const ref = formatRef('TXN', original.number);

    const refundId = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.transaction.updateMany({
        where: { id, status: TransactionStatus.COMPLETED, type: TransactionType.PAYMENT },
        data: { status: TransactionStatus.REFUNDED },
      });
      if (count === 0) throw new ConflictException('Transaction is already refunded');

      await tx.transactionEvent.create({
        data: {
          transactionId: id,
          stage: TransactionStage.REFUNDED,
          title: 'Refunded',
          description: dto.reason ?? 'Refunded to the customer',
        },
      });

      const base = Date.now();
      const refund = await tx.transaction.create({
        data: {
          userId: original.userId,
          bookingId: original.bookingId,
          originalTransactionId: original.id,
          type: TransactionType.REFUND,
          status: TransactionStatus.COMPLETED,
          amount: original.amount.negated(),
          subtotal: original.subtotal.negated(),
          gatewayFee: original.gatewayFee.negated(),
          currency: original.currency,
          paymentMethod: original.paymentMethod,
          cardBrand: original.cardBrand,
          cardLast4: original.cardLast4,
          description: `Refund for ${ref}`,
          events: {
            create: [
              {
                stage: TransactionStage.INITIATED,
                title: 'Refund initiated',
                description: dto.reason ?? 'Refund requested by an administrator',
                occurredAt: new Date(base),
              },
              {
                stage: TransactionStage.COMPLETED,
                title: 'Refund completed',
                description: 'Returned to the original payment method',
                occurredAt: new Date(base + 1000),
              },
            ],
          },
        },
      });

      if (original.bookingId) await this.syncBookingPayment(tx, original.bookingId, TransactionStatus.REFUNDED);
      await tx.activityLog.create({
        data: {
          userId: original.userId,
          action: `Refunded transaction ${ref}`,
          description: `Refunded by ${actor.name}`,
          metadata: { by: actor.id, transactionId: id, refundId: refund.id },
        },
      });
      return refund.id;
    });

    return { original: await this.findOne(id), refund: await this.findOne(refundId) };
  }

  private buildWhere(query: QueryTransactionsDto): Prisma.TransactionWhereInput {
    const { type, status, userId, minAmount, maxAmount, dateFrom, dateTo, search } = query;

    if (minAmount !== undefined && maxAmount !== undefined && minAmount > maxAmount) {
      throw new BadRequestException('minAmount must not be greater than maxAmount');
    }

    const where: Prisma.TransactionWhereInput = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (userId) where.userId = userId;

    const createdAt = buildDateRange(dateFrom, dateTo);
    if (createdAt) where.createdAt = createdAt;

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amount = { gte: minAmount, lte: maxAmount };
    }

    const term = search?.trim();
    if (term) {
      const or: Prisma.TransactionWhereInput[] = [
        { user: { name: { contains: term, mode: 'insensitive' } } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
        { gatewayReference: { contains: term, mode: 'insensitive' } },
      ];
      if (/^#?(txn-?)?\d+$/i.test(term)) {
        const n = parseRef(term);
        if (n !== null) or.push({ number: n });
      }
      where.OR = or;
    }
    return where;
  }

  private buildOrderBy(query: QueryTransactionsDto): Prisma.TransactionOrderByWithRelationInput {
    const dir = toPrismaOrder(query.sortOrder);
    switch (query.sortBy) {
      case TransactionSortField.AMOUNT:
        return { amount: dir };
      case TransactionSortField.STATUS:
        return { status: dir };
      case TransactionSortField.NUMBER:
        return { number: dir };
      default:
        return { createdAt: dir };
    }
  }

  private initialEvents(status: TransactionStatus): EventInput[] {
    const base = Date.now();
    const at = (i: number) => new Date(base + i * 1000);
    const events: EventInput[] = [
      {
        stage: TransactionStage.INITIATED,
        title: 'Initiated',
        description: 'Checkout session initialized',
        occurredAt: at(0),
      },
    ];
    if (status === TransactionStatus.COMPLETED) {
      events.push(
        {
          stage: TransactionStage.AUTHORIZED,
          title: 'Processing & Authorized',
          description: 'Gateway authorization approved',
          occurredAt: at(1),
        },
        {
          stage: TransactionStage.COMPLETED,
          title: 'Completed & Disbursed',
          description: 'Settled in merchant bank account',
          occurredAt: at(2),
        },
      );
    } else if (status === TransactionStatus.FAILED) {
      events.push({
        stage: TransactionStage.FAILED,
        title: 'Payment failed',
        description: 'Payment could not be processed',
        occurredAt: at(1),
      });
    }
    return events;
  }

  private async syncBookingPayment(tx: Prisma.TransactionClient, bookingId: string, status: TransactionStatus) {
    await tx.booking.update({ where: { id: bookingId }, data: { paymentStatus: BOOKING_PAYMENT[status] } });
  }
}

class NotFound extends NotFoundException {
  constructor() {
    super('Transaction not found');
  }
}
