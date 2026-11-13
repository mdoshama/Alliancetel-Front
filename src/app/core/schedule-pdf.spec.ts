import { describe, expect, it } from 'vitest';
import { DayCell, Schedule } from './models';
import { buildSchedulePdf, schedulePdfName, shade, storeDetails, tint, workingVsNeeded } from './schedule-pdf';

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

  it('lists each store with its hours and who works there each day', () => {
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
    expect(st.title).toBe('Oceanside (OCN)');
    expect(st.days[0]).toContain('Aisha K.\nDaniel K.');
    expect(st.days[1]).toContain('Daniel K.');
    expect(st.days[1]).not.toContain('Aisha');
    expect(st.days[6]).toBe('Closed');
    expect(st.closed[6]).toBe(true);
    expect(st.days[0].split('\n')[0]).toContain('–');
  });

  it('keeps store colors readable: light tint behind, dark shade for text', () => {
    expect(tint('#2563EB', 0.72).every((c) => c > 180)).toBe(true);
    expect(shade('#2563EB').every((c) => c < 110)).toBe(true);
    expect(tint('not a color')).toEqual([255, 255, 255]);
  });

  it('counts each day: working against what the open stores need', () => {
    const open = { closed: false } as never;
    const closed = { closed: true } as never;
    const s = {
      dates: ['2026-11-02', '2026-11-03', '2026-11-04'],
      dailyHeadCount: [9, 10, 4],
      storeCoverage: [
        { storeId: 1, minStaffPerDay: 5, dailyHours: [open, open, open] },
        { storeId: 2, minStaffPerDay: 4, dailyHours: [open, open, closed] },
        { storeId: null, minStaffPerDay: 0, dailyHours: [] },
      ],
    } as unknown as Schedule;
    expect(workingVsNeeded(s).map((c) => `${c.working}/${c.needed} ${c.label}`)).toEqual([
      '9/9 Exact',
      '10/9 +1',
      '4/5 1 short',
    ]);
  });

  it('builds a page by employee and a separate page by store', async () => {
    const s = {
      areaName: 'San Diego', weekStart: '2026-11-02', status: 'PUBLISHED', publishedAt: '2026-10-30T17:00:00Z',
      dates: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
      stores: [{ id: 1, name: 'Oceanside', code: 'OCN', label: 'OCN', color: '#2563EB', address: '1 Main St', minStaffPerDay: 1,
        hours: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((day) =>
          ({ day, opensAt: '10:00', closesAt: '20:00', closed: false })) }],
      rows: [{ employeeName: 'Aisha Khan', homeStoreName: 'Oceanside', scheduledWorkDays: 6,
        days: Array.from({ length: 7 }, (_, i) => i === 0
          ? cell({ date: '2026-11-02', type: 'REQUESTED_OFF', storeId: null, offSource: 'RESERVED' })
          : cell({ date: `2026-11-0${i + 2}` })) }],
    } as unknown as Schedule;
    const blob = await buildSchedulePdf(s);
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBe(2);
    expect(text).toContain('Schedule by employee');
    expect(text).toContain('Schedule by store');
    expect(text).toContain('Store locations');
    expect(text).toContain('AllianceTel');
    expect(text).toContain('ENTERPRISE SUITE');
    expect(text).not.toContain('Published');
    expect(text).not.toContain('1 people');
    expect(text).not.toContain('WORKING');
    expect(text).not.toContain('Reserved');
    expect(text).not.toContain('Requested');
    expect(text).toContain('DAY OFF');
    expect(text).not.toContain('6 days');
  });

  it('builds the PDF when a store row is too tall to fit on the rest of a page (many stores, big teams)', async () => {
    const week = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
    const dates = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
    const stores = Array.from({ length: 9 }, (_, i) => ({
      id: i + 1, name: 'Store ' + (i + 1), code: 'S' + (i + 1), label: 'S' + (i + 1), minStaffPerDay: 2,
      color: '#2563EB', address: (100 + i) + ' Main St',
      hours: week.map((day) => ({ day, opensAt: '10:00:00', closesAt: '20:00:00', closed: false })),
    }));
    // 45 people over 9 stores: five names in every store cell makes the rows tall enough to reach a page end.
    const rows = Array.from({ length: 45 }, (_, k) => ({
      employeeName: 'Person ' + k + ' Test', role: 'EMPLOYEE', trainee: false,
      days: dates.map((date) => cell({ date, storeId: (k % 9) + 1, storeName: 'Store ' + ((k % 9) + 1) })),
    }));
    const s = { areaName: 'Big Area', weekStart: dates[0], status: 'DRAFT', dates, stores, rows } as unknown as Schedule;
    const pdf = await buildSchedulePdf(s);
    expect(pdf.size).toBeGreaterThan(1000);
  });
});