import { describe, expect, it } from 'vitest';
import { DayCell, Schedule } from './models';
import { pdfCellText, schedulePdfName, storeDetails } from './schedule-pdf';

const cell = (over: Partial<DayCell>): DayCell =>
  ({
    entryId: 1,
    date: '2026-11-02',
    type: 'WORK',
    storeId: 1,
    storeName: 'Oceanside',
    storeLabel: 'OCN',
    storeColor: '#2563EB',
    autoAssigned: false,
    manuallyEdited: false,
    opensAt: '10:00:00',
    closesAt: '20:00:00',
    storeClosed: false,
    request: null,
    ...over,
  }) as DayCell;

describe('schedule PDF', () => {
  it('names the file after the area and week', () => {
    expect(schedulePdfName({ areaName: 'San Diego', weekStart: '2026-11-02' } as Schedule)).toBe(
      'AllianceTel-San-Diego-2026-11-02.pdf',
    );
  });

  it('marks a draft in the file name', () => {
    expect(schedulePdfName({ areaName: 'San Diego', weekStart: '2026-11-02', status: 'DRAFT' } as Schedule)).toBe(
      'AllianceTel-San-Diego-2026-11-02-DRAFT.pdf',
    );
  });

  it('shows the store and shift for a work day', () => {
    const text = pdfCellText(cell({}));
    expect(text.startsWith('Oceanside\n')).toBe(true);
    expect(text).toContain('–');
  });

  it('shows days off plainly', () => {
    expect(pdfCellText(cell({ type: 'OFF', storeId: null, storeName: null }))).toBe('Off');
    expect(pdfCellText(cell({ type: 'REQUESTED_OFF', storeId: null, storeName: null }))).toBe('Day off');
  });

  it('falls back to "Work" when no store is set', () => {
    expect(pdfCellText(cell({ storeId: null, storeName: null, opensAt: null, closesAt: null }))).toBe('Work');
  });

  it('lists each store with its address, hours and who works there each day', () => {
    const week = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
    const s = {
      dates: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
      stores: [
        {
          id: 1,
          name: 'Oceanside',
          code: 'OCN',
          label: 'OCN',
          minStaffPerDay: 2,
          color: '#2563EB',
          address: '123 Mission Ave, Oceanside',
          hours: week.map((day) => ({ day, opensAt: '10:00:00', closesAt: '20:00:00', closed: day === 'SUNDAY' })),
        },
      ],
      rows: [
        { employeeName: 'Aisha Khan', days: [cell({}), cell({ type: 'OFF', storeId: null })] },
        { employeeName: 'Daniel Kim', days: [cell({}), cell({})] },
      ],
    } as unknown as Schedule;
    const [st] = storeDetails(s);
    expect(st.title).toBe('Oceanside (OCN)\n123 Mission Ave, Oceanside');
    expect(st.days[0]).toContain('Aisha K., Daniel K.');
    expect(st.days[1]).toContain('Daniel K.');
    expect(st.days[1]).not.toContain('Aisha');
    expect(st.days[6]).toBe('Closed');
    expect(st.closed[6]).toBe(true);
  });
});
