import { DayHours } from './models';
import { formatHours, formatTime, hoursError, summarizeWeek, WEEK_DAYS } from './store-hours';

function week(overrides: Partial<Record<string, Partial<DayHours>>> = {}): DayHours[] {
  return WEEK_DAYS.map((day) => ({ day, opensAt: '10:00:00', closesAt: '20:00:00', closed: false, ...overrides[day] }));
}

describe('store hours', () => {
  it('formats times in 12-hour style', () => {
    expect(formatTime('10:00')).toBe('10am');
    expect(formatTime('20:00:00')).toBe('8pm');
    expect(formatTime('09:30')).toBe('9:30am');
    expect(formatTime('12:00')).toBe('12pm');
    expect(formatTime('00:00')).toBe('12am');
    expect(formatHours({ opensAt: '11:00', closesAt: '19:00', closed: false })).toBe('11am–7pm');
    expect(formatHours({ opensAt: null, closesAt: null, closed: true })).toBe('Closed');
  });

  it('summarises a week by grouping days with the same hours', () => {
    expect(summarizeWeek(week())).toBe('Every day 10am–8pm');
    expect(summarizeWeek(week({ SUNDAY: { opensAt: '11:00', closesAt: '19:00' } }))).toBe(
      'Mon–Sat 10am–8pm · Sun 11am–7pm',
    );
    expect(
      summarizeWeek(
        week({
          MONDAY: { opensAt: '09:00', closesAt: '19:00' },
          SUNDAY: { closed: true, opensAt: null, closesAt: null },
        }),
      ),
    ).toBe('Mon 9am–7pm · Tue–Sat 10am–8pm · Sun Closed');
  });

  it('flags missing or reversed times but not closed days', () => {
    expect(hoursError({ opensAt: '10:00', closesAt: '20:00', closed: false })).toBeNull();
    expect(hoursError({ opensAt: '20:00', closesAt: '10:00', closed: false })).toContain('after');
    expect(hoursError({ opensAt: '', closesAt: '20:00', closed: false })).toContain('both');
    expect(hoursError({ opensAt: null, closesAt: null, closed: true })).toBeNull();
  });
});
