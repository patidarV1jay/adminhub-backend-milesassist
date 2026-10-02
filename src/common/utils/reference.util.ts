export type RefPrefix = 'USR' | 'TXN' | 'BKG';

export function formatRef(prefix: RefPrefix, num: number): string {
  return `${prefix}-${num}`;
}

export function parseRef(input: string): number | null {
  const match = input.trim().match(/(\d+)$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isSafeInteger(n) && n <= 2_147_483_647 ? n : null;
}
