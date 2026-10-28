/** Dates travel to and from the API as local 'yyyy-MM-dd' strings, never as UTC timestamps. */

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Monday of the week containing the given date. */
export function weekStartOf(value: string | Date): string {
  const date = typeof value === 'string' ? parseIsoDate(value) : new Date(value);
  const offset = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - offset);
  return toIsoDate(date);
}

export function today(): string {
  return toIsoDate(new Date());
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function formatDay(value: string, options: Intl.DateTimeFormatOptions): string {
  return parseIsoDate(value).toLocaleDateString('en-US', options);
}

export function formatWeekRange(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const sameYear = weekStart.slice(0, 4) === end.slice(0, 4);
  const start = formatDay(weekStart, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  return `${start} – ${formatDay(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
