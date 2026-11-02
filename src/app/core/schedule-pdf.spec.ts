import { describe, expect, it } from 'vitest';
import { DayCell, Schedule } from './models';
import { pdfCellText, schedulePdfName } from './schedule-pdf';

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
});
