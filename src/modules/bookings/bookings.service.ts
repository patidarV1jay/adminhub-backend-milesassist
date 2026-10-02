import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, LocationType, PaymentStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { toCsv } from '../../common/utils/csv.util';
import { buildDateRange } from '../../common/utils/date-range.util';
import { buildMetric } from '../../common/utils/metric.util';
import { paginated, skipTake, toPrismaOrder } from '../../common/utils/pagination.util';
import { formatRef, parseRef } from '../../common/utils/reference.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  bookingCustomerSelect,
  bookingListInclude,
  durationLabel,
  locationLabel,
  toBookingListItem,
  toCustomer,
} from './bookings.mapper';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingSortField, QueryBookingsDto } from './dto/query-bookings.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

const DAY = 86_400_000;
const MINUTE = 60_000;
const MAX_DURATION_MINUTES = 480;
const INVOICE_OFFSET = 10_000; // booking #1 -> INV-10001
const EXPORT_LIMIT = 10_000;

const ACTIVE: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.CANCELLED]: [],
};

type EventInput = Prisma.BookingEventCreateWithoutBookingInput;

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryBookingsDto) {
    const where = this.buildWhere(query);
    const { page, limit } = query;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        orderBy: this.buildOrderBy(query),
        include: bookingListInclude,
        ...skipTake(page, limit),
      }),
      this.prisma.booking.count({ where }),
    ]);
    return paginated(rows.map(toBookingListItem), total, page, limit);
  }

  async exportCsv(query: QueryBookingsDto): Promise<string> {
    const rows = await this.prisma.booking.findMany({
      where: this.buildWhere(query),
      orderBy: this.buildOrderBy(query),
      include: bookingListInclude,
      take: EXPORT_LIMIT,
    });

    return toCsv(
      ['Booking ID', 'Customer', 'Email', 'Service', 'Date & Time (UTC)', 'Duration', 'Status', 'Payment Status', 'Amount'],
      rows.map((b) => [
        formatRef('BKG', b.number),
        b.customer.name,
        b.customer.email,
        b.service.name,
        b.scheduledAt.toISOString(),
        durationLabel(b.durationMinutes),
        b.status,
        b.paymentStatus,
        b.amount.toFixed(2),
      ]),
    );
  }

  async stats() {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * DAY);
    const d60 = new Date(now.getTime() - 60 * DAY);
    const last30: Prisma.DateTimeFilter = { gte: d30, lte: now };
    const prev30: Prisma.DateTimeFilter = { gte: d60, lt: d30 };

    const windowed = async (where: Prisma.BookingWhereInput) => {
      const [value, current, previous] = await Promise.all([
        this.prisma.booking.count({ where }),
        this.prisma.booking.count({ where: { ...where, createdAt: last30 } }),
        this.prisma.booking.count({ where: { ...where, createdAt: prev30 } }),
      ]);
      return buildMetric(value, current, previous);
    };

    const [totalBookings, activeBookings, completedBookings, cancelledBookings] = await Promise.all([
      windowed({}),
      windowed({ status: { in: ACTIVE } }),
      windowed({ status: BookingStatus.COMPLETED }),
      windowed({ status: BookingStatus.CANCELLED }),
    ]);

    return {
      totalBookings,
      activeBookings,
      completedBookings,
      cancelledBookings,
      comparison: 'Last 30 days vs the 30 days before',
    };
  }

  async findOne(id: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        customer: { select: bookingCustomerSelect },
        service: { select: { id: true, name: true, price: true } },
        events: { orderBy: { occurredAt: 'desc' } },
        transactions: {
          select: { id: true, number: true, amount: true, status: true, type: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!b) throw new NotFoundException('Booking not found');

    const [totalBookings, completedBookings] = await Promise.all([
      this.prisma.booking.count({ where: { customerId: b.customerId } }),
      this.prisma.booking.count({ where: { customerId: b.customerId, status: BookingStatus.COMPLETED } }),
    ]);

    const endsAt = new Date(b.scheduledAt.getTime() + b.durationMinutes * MINUTE);
    const open = ACTIVE.includes(b.status);

    return {
      id: b.id,
      reference: formatRef('BKG', b.number),
      status: b.status,
      paymentStatus: b.paymentStatus,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      canReschedule: open,
      canCancel: open,
      logistics: {
        service: { id: b.service.id, name: b.service.name },
        scheduledAt: b.scheduledAt,
        startsAt: b.scheduledAt,
        endsAt,
        timezone: b.timezone,
        durationMinutes: b.durationMinutes,
        durationLabel: durationLabel(b.durationMinutes),
        locationType: b.locationType,
        locationLabel: locationLabel(b.locationType, b.meetingLink),
        meetingLink: b.meetingLink,
        notes: b.notes,
      },
      payment: {
        billingAmount: b.amount.toNumber(),
        paymentStatus: b.paymentStatus,
        invoiceNumber: b.invoiceNumber,
        transactions: b.transactions.map((t) => ({
          id: t.id,
          reference: formatRef('TXN', t.number),
          amount: t.amount.toNumber(),
          type: t.type,
          status: t.status,
          createdAt: t.createdAt,
        })),
      },
      cancellation: b.cancelledAt ? { cancelledAt: b.cancelledAt, reason: b.cancellationReason } : null,
      customer: { ...toCustomer(b.customer), totalBookings, completedBookings },
      lifecycle: b.events.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        occurredAt: e.occurredAt,
      })),
    };
  }

  async create(dto: CreateBookingDto, actor: AuthUser) {
    const customer = await this.prisma.user.findFirst({
      where: { id: dto.customerId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const service = await this.prisma.service.findUnique({ where: { id: dto.serviceId } });
    if (!service) throw new NotFoundException('Service not found');
    if (!service.isActive) throw new ConflictException('This service is not available for booking');

    const start = new Date(dto.scheduledAt);
    if (start.getTime() <= Date.now()) throw new BadRequestException('scheduledAt must be in the future');

    const minutes = dto.durationMinutes ?? service.defaultDurationMinutes;
    await this.assertNoOverlap(dto.customerId, start, minutes);

    const status = dto.status ?? BookingStatus.PENDING;
    const events: EventInput[] = [
      { title: 'Booking Created', description: `Created by ${actor.name}`, occurredAt: new Date() },
    ];
    if (status === BookingStatus.CONFIRMED) {
      events.push({
        title: 'Status Set to Confirmed',
        description: `Confirmed by ${actor.name}`,
        occurredAt: new Date(Date.now() + 1000),
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const b = await tx.booking.create({
        data: {
          customerId: dto.customerId,
          serviceId: dto.serviceId,
          scheduledAt: start,
          durationMinutes: minutes,
          timezone: dto.timezone ?? 'EST',
          status,
          locationType: dto.locationType ?? LocationType.VIRTUAL,
          meetingLink: dto.meetingLink,
          notes: dto.notes,
          amount: dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : service.price,
          events: { create: events },
        },
      });
      await tx.booking.update({
        where: { id: b.id },
        data: { invoiceNumber: `INV-${INVOICE_OFFSET + b.number}` },
      });
      await tx.activityLog.create({
        data: {
          userId: dto.customerId,
          action: `Created booking ${formatRef('BKG', b.number)}`,
          description: service.name,
          metadata: { by: actor.id, bookingId: b.id },
        },
      });
      return b;
    });

    return this.findOne(created.id);
  }

  async update(id: string, dto: UpdateBookingDto, actor: AuthUser) {
    if (!Object.values(dto).some((v) => v !== undefined)) {
      throw new BadRequestException('No changes supplied');
    }

    const b = await this.prisma.booking.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Booking not found');

    if (!ACTIVE.includes(b.status)) {
      throw new ConflictException(`Cannot modify a ${b.status.toLowerCase()} booking`);
    }

    const statusChanging = dto.status !== undefined && dto.status !== b.status;
    if (statusChanging && !TRANSITIONS[b.status].includes(dto.status as BookingStatus)) {
      throw new ConflictException(`Cannot change status from ${b.status} to ${dto.status}`);
    }

    const cancelling = dto.status === BookingStatus.CANCELLED;
    if (dto.cancellationReason !== undefined && !cancelling) {
      throw new BadRequestException('cancellationReason can only be set when status is CANCELLED');
    }
    if (dto.amount !== undefined && b.paymentStatus === PaymentStatus.PAID) {
      throw new ConflictException('The amount cannot be changed after the booking has been paid');
    }

    const newStart = dto.scheduledAt ? new Date(dto.scheduledAt) : b.scheduledAt;
    const newMinutes = dto.durationMinutes ?? b.durationMinutes;
    const rescheduling = dto.scheduledAt !== undefined && newStart.getTime() !== b.scheduledAt.getTime();
    const durationChanging = dto.durationMinutes !== undefined && dto.durationMinutes !== b.durationMinutes;

    if (rescheduling && newStart.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }
    if ((rescheduling || durationChanging) && !cancelling) {
      await this.assertNoOverlap(b.customerId, newStart, newMinutes, b.id);
    }

    const base = Date.now();
    const events: EventInput[] = [];
    const push = (title: string, description: string) =>
      events.push({ title, description, occurredAt: new Date(base + events.length * 1000) });

    if (rescheduling) {
      push('Rescheduled', `Moved from ${b.scheduledAt.toISOString()} to ${newStart.toISOString()} by ${actor.name}`);
    }
    if (durationChanging) {
      push('Duration Updated', `Changed from ${b.durationMinutes} to ${newMinutes} minutes by ${actor.name}`);
    }
    if (statusChanging) {
      if (dto.status === BookingStatus.CONFIRMED) push('Status Set to Confirmed', `Confirmed by ${actor.name}`);
      else if (dto.status === BookingStatus.COMPLETED) push('Booking Completed', `Marked completed by ${actor.name}`);
      else push('Booking Cancelled', dto.cancellationReason ?? `Cancelled by ${actor.name}`);
    }
    const detailsChanged =
      dto.notes !== undefined ||
      dto.meetingLink !== undefined ||
      dto.locationType !== undefined ||
      dto.timezone !== undefined ||
      dto.amount !== undefined;
    if (detailsChanged) push('Booking Updated', `Details updated by ${actor.name}`);

    let action = 'Updated booking';
    if (cancelling) action = 'Cancelled booking';
    else if (dto.status === BookingStatus.COMPLETED) action = 'Completed booking';
    else if (dto.status === BookingStatus.CONFIRMED) action = 'Confirmed booking';
    else if (rescheduling) action = 'Rescheduled booking';

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.booking.updateMany({
        where: { id, status: b.status },
        data: {
          scheduledAt: rescheduling ? newStart : undefined,
          durationMinutes: dto.durationMinutes,
          timezone: dto.timezone,
          locationType: dto.locationType,
          meetingLink: dto.meetingLink,
          notes: dto.notes,
          amount: dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : undefined,
          status: dto.status,
          cancelledAt: cancelling ? new Date() : undefined,
          cancellationReason: cancelling ? (dto.cancellationReason ?? null) : undefined,
        },
      });
      if (count === 0) throw new ConflictException('Booking was modified by another request, please retry');

      if (events.length > 0) {
        await tx.bookingEvent.createMany({ data: events.map((e) => ({ ...e, bookingId: id })) });
      }
      await tx.activityLog.create({
        data: {
          userId: b.customerId,
          action: `${action} ${formatRef('BKG', b.number)}`,
          description: `Updated by ${actor.name}`,
          metadata: { by: actor.id, bookingId: id },
        },
      });
    });

    return this.findOne(id);
  }

  private buildWhere(query: QueryBookingsDto): Prisma.BookingWhereInput {
    const { status, serviceId, customerId, dateFrom, dateTo, search } = query;

    const where: Prisma.BookingWhereInput = {};
    if (status) where.status = status;
    if (serviceId) where.serviceId = serviceId;
    if (customerId) where.customerId = customerId;

    const scheduledAt = buildDateRange(dateFrom, dateTo);
    if (scheduledAt) where.scheduledAt = scheduledAt;

    const term = search?.trim();
    if (term) {
      const or: Prisma.BookingWhereInput[] = [
        { customer: { name: { contains: term, mode: 'insensitive' } } },
        { customer: { email: { contains: term, mode: 'insensitive' } } },
        { invoiceNumber: { contains: term, mode: 'insensitive' } },
      ];
      if (/^#?(bkg-?)?\d+$/i.test(term)) {
        const n = parseRef(term);
        if (n !== null) or.push({ number: n });
      }
      where.OR = or;
    }
    return where;
  }

  private buildOrderBy(query: QueryBookingsDto): Prisma.BookingOrderByWithRelationInput {
    const dir = toPrismaOrder(query.sortOrder);
    switch (query.sortBy) {
      case BookingSortField.CREATED_AT:
        return { createdAt: dir };
      case BookingSortField.AMOUNT:
        return { amount: dir };
      case BookingSortField.STATUS:
        return { status: dir };
      case BookingSortField.NUMBER:
        return { number: dir };
      default:
        return { scheduledAt: dir };
    }
  }

  private async assertNoOverlap(customerId: string, start: Date, minutes: number, excludeId?: string) {
    const end = new Date(start.getTime() + minutes * MINUTE);
    const earliest = new Date(start.getTime() - MAX_DURATION_MINUTES * MINUTE);

    const candidates = await this.prisma.booking.findMany({
      where: {
        customerId,
        id: excludeId ? { not: excludeId } : undefined,
        status: { in: ACTIVE },
        scheduledAt: { gt: earliest, lt: end },
      },
      select: { number: true, scheduledAt: true, durationMinutes: true },
    });

    const clash = candidates.find((c) => c.scheduledAt.getTime() + c.durationMinutes * MINUTE > start.getTime());
    if (clash) {
      throw new ConflictException(`The customer already has booking ${formatRef('BKG', clash.number)} at this time`);
    }
  }
}
