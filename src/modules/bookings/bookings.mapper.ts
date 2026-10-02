import { LocationType, Prisma } from '@prisma/client';
import { formatRef } from '../../common/utils/reference.util';

export const bookingCustomerSelect = {
  id: true,
  number: true,
  name: true,
  email: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

export const bookingListInclude = {
  customer: { select: bookingCustomerSelect },
  service: { select: { id: true, name: true } },
} satisfies Prisma.BookingInclude;

export type BookingRow = Prisma.BookingGetPayload<{ include: typeof bookingListInclude }>;
export type BookingCustomer = Prisma.UserGetPayload<{ select: typeof bookingCustomerSelect }>;

export function durationLabel(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toFixed(1)} ${hours === 1 ? 'hr' : 'hrs'}`;
}

export function locationLabel(type: LocationType, meetingLink: string | null): string {
  if (type === LocationType.VIRTUAL) return meetingLink ? 'Virtual - Meeting Link Provided' : 'Virtual';
  return 'In person';
}

export function toCustomer(user: BookingCustomer) {
  return {
    id: user.id,
    reference: formatRef('USR', user.number),
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

export function toBookingListItem(b: BookingRow) {
  return {
    id: b.id,
    reference: formatRef('BKG', b.number),
    customer: toCustomer(b.customer),
    service: { id: b.service.id, name: b.service.name },
    scheduledAt: b.scheduledAt,
    durationMinutes: b.durationMinutes,
    durationLabel: durationLabel(b.durationMinutes),
    status: b.status,
    paymentStatus: b.paymentStatus,
    amount: b.amount.toNumber(),
  };
}
