import { DayHours, DayOfWeek } from './models';

export const WEEK_DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export const DAY_SHORT: Record<DayOfWeek, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
};

export const DEFAULT_OPENS = '10:00';
export const DEFAULT_CLOSES = '20:00';

/** "10:00" or "10:00:00" → "10am"; "09:30" → "9:30am"; "20:00" → "8pm". */
export function formatTime(time: string | null | undefined): string {
  if (!time) {
    return '';
  }
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour12}:${String(m).padStart(2, '0')}${suffix}` : `${hour12}${suffix}`;
}

/** "10am–8pm", or "Closed". */
export function formatHours(h: Pick<DayHours, 'opensAt' | 'closesAt' | 'closed'> | null | undefined): string {
  if (!h) {
    return '';
  }
  return h.closed ? 'Closed' : `${formatTime(h.opensAt)}–${formatTime(h.closesAt)}`;
}

/** Trims seconds so "10:00:00" and "10:00" compare equal and fit an <input type="time">. */
export function hhmm(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : '';
}

/**
 * Groups neighbouring days with the same hours: e.g. "Mon–Sat 10am–8pm · Sun 11am–7pm".
 * Seven identical days read "Every day 10am–8pm".
 */
export function summarizeWeek(hours: DayHours[]): string {
  const ordered = WEEK_DAYS.map((d) => hours.find((h) => h.day === d)).filter((h): h is DayHours => !!h);
  const groups: { from: DayOfWeek; to: DayOfWeek; label: string }[] = [];
  for (const h of ordered) {
    const label = formatHours({ ...h, opensAt: hhmm(h.opensAt), closesAt: hhmm(h.closesAt) });
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.to = h.day;
    } else {
      groups.push({ from: h.day, to: h.day, label });
    }
  }
  if (groups.length === 1 && ordered.length === 7) {
    return `Every day ${groups[0].label}`;
  }
  return groups
    .map((g) => (g.from === g.to ? DAY_SHORT[g.from] : `${DAY_SHORT[g.from]}–${DAY_SHORT[g.to]}`) + ' ' + g.label)
    .join(' · ');
}

/** Problem with one day's hours, or null when fine. */
export function hoursError(h: Pick<DayHours, 'opensAt' | 'closesAt' | 'closed'>): string | null {
  if (h.closed) {
    return null;
  }
  if (!h.opensAt || !h.closesAt) {
    return 'Enter both times or mark closed';
  }
  return hhmm(h.closesAt) > hhmm(h.opensAt) ? null : 'Closing must be after opening';
}
