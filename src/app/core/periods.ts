import { addDays, today, weekStartOf } from './date-utils';

export type PeriodKey = 'week' | 'month' | 'lastMonth' | '30d' | 'custom';

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  week: 'This week',
  month: 'This month',
  lastMonth: 'Last month',
  '30d': 'Last 30 days',
  custom: 'Custom',
};

/** The from/to dates (ISO) of a preset period, ending today at the latest. */
export function periodRange(key: Exclude<PeriodKey, 'custom'>, now: string = today()): { from: string; to: string } {
  const [y, m] = now.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  switch (key) {
    case 'week':
      return { from: weekStartOf(now), to: now };
    case 'month':
      return { from: `${y}-${pad(m)}-01`, to: now };
    case 'lastMonth': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
      return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last)}` };
    }
    case '30d':
      return { from: addDays(now, -29), to: now };
  }
}
