import { Injectable } from '@nestjs/common';
import {
  AlertSeverity,
  BookingStatus,
  Prisma,
  TransactionStatus,
  TransactionType,
  UserStatus,
} from '@prisma/client';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ChartRange } from './dto/chart-query.dto';

const DAY = 86_400_000;

type Unit = 'day' | 'week' | 'month';

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfUtcWeek = (d: Date) => {
  const day = startOfUtcDay(d);
  const dow = (day.getUTCDay() + 6) % 7; // Monday = 0 (matches Postgres date_trunc('week'))
  return new Date(day.getTime() - dow * DAY);
};
const startOfUtcMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  [AlertSeverity.CRITICAL]: 0,
  [AlertSeverity.WARNING]: 1,
  [AlertSeverity.INFO]: 2,
};

export interface DashboardAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string | null;
  createdAt: Date;
  source: 'computed' | 'stored';
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async getStats() {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * DAY);
    const d60 = new Date(now.getTime() - 60 * DAY);
    const last30: Prisma.DateTimeFilter = { gte: d30, lte: now };
    const prev30: Prisma.DateTimeFilter = { gte: d60, lt: d30 };

    const activeBookings: Prisma.BookingWhereInput = {
      status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
    };
    const pendingTx: Prisma.TransactionWhereInput = { status: TransactionStatus.PENDING };
    const users: Prisma.UserWhereInput = { deletedAt: null };

    const [
      totalUsers, usersCur, usersPrev,
      revenueTotal, revenueCur, revenuePrev,
      activeTotal, activeCur, activePrev,
      pendingTotal, pendingCur, pendingPrev,
    ] = await Promise.all([
      this.prisma.user.count({ where: users }),
      this.prisma.user.count({ where: { ...users, createdAt: last30 } }),
      this.prisma.user.count({ where: { ...users, createdAt: prev30 } }),

      this.sumRevenue(),
      this.sumRevenue(last30),
      this.sumRevenue(prev30),

      this.prisma.booking.count({ where: activeBookings }),
      this.prisma.booking.count({ where: { ...activeBookings, createdAt: last30 } }),
      this.prisma.booking.count({ where: { ...activeBookings, createdAt: prev30 } }),

      this.prisma.transaction.count({ where: pendingTx }),
      this.prisma.transaction.count({ where: { ...pendingTx, createdAt: last30 } }),
      this.prisma.transaction.count({ where: { ...pendingTx, createdAt: prev30 } }),
    ]);

    return {
      totalUsers: this.metric(totalUsers, usersCur, usersPrev),
      totalRevenue: this.metric(revenueTotal, revenueCur, revenuePrev),
      activeBookings: this.metric(activeTotal, activeCur, activePrev),
      pendingTransactions: this.metric(pendingTotal, pendingCur, pendingPrev),
      comparison: 'Last 30 days vs the 30 days before',
      generatedAt: now,
    };
  }

  private async sumRevenue(createdAt?: Prisma.DateTimeFilter): Promise<number> {
    const result = await this.prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { status: TransactionStatus.COMPLETED, type: TransactionType.PAYMENT, createdAt },
    });
    return result._sum.amount?.toNumber() ?? 0;
  }

  private metric(value: number, current: number, previous: number) {
    let changePercent: number;
    if (previous === 0) changePercent = current === 0 ? 0 : 100;
    else changePercent = Math.round(((current - previous) / previous) * 1000) / 10;

    const trend = current > previous ? 'up' : current < previous ? 'down' : 'flat';
    return { value, changePercent, trend };
  }

  async getCharts(range: ChartRange) {
    const now = new Date();
    const { unit, starts } = this.plan(range, now);
    const from = starts[0];

    const rows = await this.prisma.$queryRaw<{ bucket: Date; revenue: Prisma.Decimal | null }[]>`
      SELECT date_trunc(${Prisma.raw(`'${unit}'`)}, "createdAt") AS bucket, SUM("amount") AS revenue
      FROM "Transaction"
      WHERE "status" = 'COMPLETED' AND "type" = 'PAYMENT'
        AND "createdAt" >= ${from} AND "createdAt" <= ${now}
      GROUP BY 1
      ORDER BY 1`;

    const byBucket = new Map(rows.map((r) => [r.bucket.toISOString(), Number(r.revenue ?? 0)]));

    const series = starts.map((start) => ({
      label: this.label(start, unit),
      date: start.toISOString(),
      revenue: byBucket.get(start.toISOString()) ?? 0,
    }));

    return {
      range,
      granularity: unit,
      from,
      to: now,
      totalRevenue: series.reduce((sum, p) => sum + p.revenue, 0),
      series,
    };
  }

  private plan(range: ChartRange, now: Date): { unit: Unit; starts: Date[] } {
    const today = startOfUtcDay(now);
    const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(today.getTime() - (n - 1 - i) * DAY));

    switch (range) {
      case ChartRange.D7:
        return { unit: 'day', starts: days(7) };
      case ChartRange.M1:
        return { unit: 'day', starts: days(30) };
      case ChartRange.M3: {
        const week = startOfUtcWeek(now);
        return { unit: 'week', starts: Array.from({ length: 13 }, (_, i) => new Date(week.getTime() - (12 - i) * 7 * DAY)) };
      }
      case ChartRange.Y1:
        return { unit: 'month', starts: Array.from({ length: 12 }, (_, i) => addMonths(startOfUtcMonth(now), -(11 - i))) };
      case ChartRange.M6:
      default:
        return { unit: 'month', starts: Array.from({ length: 6 }, (_, i) => addMonths(startOfUtcMonth(now), -(5 - i))) };
    }
  }

  private label(date: Date, unit: Unit): string {
    return unit === 'month'
      ? date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  async getAlerts(): Promise<DashboardAlert[]> {
    const now = new Date();
    const since = new Date(now.getTime() - DAY);

    const [pending, failed24h, stored] = await Promise.all([
      this.prisma.transaction.count({ where: { status: TransactionStatus.PENDING } }),
      this.prisma.transaction.count({ where: { status: TransactionStatus.FAILED, createdAt: { gte: since } } }),
      this.prisma.systemAlert.findMany({ where: { isResolved: false }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);

    const alerts: DashboardAlert[] = [];

    const memory = this.metrics.memoryUsagePercent();
    if (memory >= 80) {
      alerts.push({
        id: 'computed:server-capacity',
        severity: memory >= 90 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
        title: `Server capacity at ${memory}%`,
        description: 'Scale resources',
        createdAt: now,
        source: 'computed',
      });
    }
    if (pending > 0) {
      alerts.push({
        id: 'computed:pending-transactions',
        severity: AlertSeverity.WARNING,
        title: `${pending} transaction${pending === 1 ? '' : 's'} pending`,
        description: 'Pending review',
        createdAt: now,
        source: 'computed',
      });
    }
    if (failed24h > 0) {
      alerts.push({
        id: 'computed:failed-transactions',
        severity: failed24h >= 10 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
        title: `${failed24h} failed transaction${failed24h === 1 ? '' : 's'} in the last 24 hours`,
        description: 'Check the payment gateway',
        createdAt: now,
        source: 'computed',
      });
    }
    for (const a of stored) {
      alerts.push({
        id: a.id,
        severity: a.severity,
        title: a.title,
        description: a.description,
        createdAt: a.createdAt,
        source: 'stored',
      });
    }

    return alerts.sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async getSystemHealth() {
    const activeSince = new Date(Date.now() - 15 * 60_000);
    const activeSessions = await this.prisma.user.count({
      where: { deletedAt: null, status: UserStatus.ACTIVE, lastActiveAt: { gte: activeSince } },
    });

    return {
      status: 'operational',
      uptimeSeconds: this.metrics.uptimeSeconds(),
      avgResponseTimeMs: this.metrics.averageResponseTimeMs(),
      activeSessions, // users active in the last 15 minutes
      memoryUsagePercent: this.metrics.memoryUsagePercent(),
    };
  }
}
