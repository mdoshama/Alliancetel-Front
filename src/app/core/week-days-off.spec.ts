import { weekDayOffLabel } from './week-days-off';

describe('weekDayOffLabel', () => {
  it('names the day and why they have it off', () => {
    expect(weekDayOffLabel({ id: 1, date: '2026-11-16', kind: 'REGULAR', status: 'PENDING' })).toBe('Mon, Nov 16 · regular day');
    expect(weekDayOffLabel({ id: 2, date: '2026-11-19', kind: 'EMERGENCY', status: 'PENDING' })).toBe('Thu, Nov 19 · emergency, waiting');
    expect(weekDayOffLabel({ id: 3, date: '2026-11-20', kind: 'SYSTEM', status: 'APPROVED' })).toBe('Fri, Nov 20 · given by the system');
  });
});
