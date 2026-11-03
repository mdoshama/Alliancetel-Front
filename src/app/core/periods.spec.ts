import { describe, expect, it } from 'vitest';
import { periodRange } from './periods';

describe('periodRange', () => {
  it('this month runs from the 1st to today', () => {
    expect(periodRange('month', '2026-11-02')).toEqual({ from: '2026-11-01', to: '2026-11-02' });
  });
  it('last month is the whole previous month, across a year end too', () => {
    expect(periodRange('lastMonth', '2026-11-02')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('lastMonth', '2027-01-15')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
  it('last 30 days includes today', () => {
    expect(periodRange('30d', '2026-11-30')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });
});
