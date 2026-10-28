import { addDays, formatWeekRange, weekDates, weekStartOf } from './date-utils';

describe('date-utils', () => {
  it('finds the Monday of a week', () => {
    expect(weekStartOf('2026-11-04')).toBe('2026-11-02'); // Wednesday
    expect(weekStartOf('2026-11-02')).toBe('2026-11-02'); // Monday
    expect(weekStartOf('2026-11-08')).toBe('2026-11-02'); // Sunday belongs to the same week
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });

  it('lists the 7 days of a week', () => {
    const days = weekDates('2026-12-28');
    expect(days.length).toBe(7);
    expect(days[6]).toBe('2027-01-03');
  });

  it('formats a week range', () => {
    expect(formatWeekRange('2026-11-02')).toBe('Nov 2 – Nov 8, 2026');
  });
});
