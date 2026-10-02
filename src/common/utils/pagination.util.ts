import { SortOrder } from '../dto/pagination.dto';

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export function skipTake(page: number, limit: number) {
  return { skip: (page - 1) * limit, take: limit };
}

export function toPrismaOrder(order: SortOrder): 'asc' | 'desc' {
  return order === SortOrder.ASC ? 'asc' : 'desc';
}

export function paginated<T>(data: T[], total: number, page: number, limit: number): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
