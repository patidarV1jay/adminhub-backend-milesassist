import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const DAY = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function buildDateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;

  const filter: Prisma.DateTimeFilter = {};
  let fromDate: Date | undefined;
  let toDate: Date | undefined;

  if (from) {
    fromDate = new Date(from);
    filter.gte = fromDate;
  }
  if (to) {
    toDate = new Date(to);
    if (DATE_ONLY.test(to)) filter.lt = new Date(toDate.getTime() + DAY);
    else filter.lte = toDate;
  }
  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
    throw new BadRequestException('dateFrom must not be after dateTo');
  }
  return filter;
}
