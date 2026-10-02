export type Trend = 'up' | 'down' | 'flat';

export function buildMetric(value: number, current: number, previous: number) {
  let changePercent: number;
  if (previous === 0) changePercent = current === 0 ? 0 : 100;
  else changePercent = Math.round(((current - previous) / previous) * 1000) / 10;

  const trend: Trend = current > previous ? 'up' : current < previous ? 'down' : 'flat';
  return { value, changePercent, trend };
}
