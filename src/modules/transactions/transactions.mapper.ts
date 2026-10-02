import { Prisma, Transaction } from '@prisma/client';
import { formatRef } from '../../common/utils/reference.util';

export const transactionUserSelect = {
  id: true,
  number: true,
  name: true,
  email: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

export const transactionListInclude = {
  user: { select: transactionUserSelect },
} satisfies Prisma.TransactionInclude;

export type TransactionWithUser = Prisma.TransactionGetPayload<{ include: typeof transactionListInclude }>;
export type TransactionUser = Prisma.UserGetPayload<{ select: typeof transactionUserSelect }>;

export function paymentMethodLabel(t: Pick<Transaction, 'paymentMethod' | 'cardBrand' | 'cardLast4'>): string {
  if (t.cardBrand && t.cardLast4) return `${t.paymentMethod} (${t.cardBrand} ending in ${t.cardLast4})`;
  if (t.cardLast4) return `${t.paymentMethod} (ending in ${t.cardLast4})`;
  return t.paymentMethod;
}

export function toCustomer(user: TransactionUser) {
  return {
    id: user.id,
    reference: formatRef('USR', user.number),
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

export function toTransactionListItem(t: TransactionWithUser) {
  return {
    id: t.id,
    reference: formatRef('TXN', t.number),
    user: toCustomer(t.user),
    type: t.type,
    amount: t.amount.toNumber(),
    currency: t.currency,
    status: t.status,
    createdAt: t.createdAt,
  };
}
