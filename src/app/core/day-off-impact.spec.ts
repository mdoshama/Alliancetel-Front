import { approvalCard } from './day-off-impact';
import { DayOffImpact } from './models';

function impact(overrides: Partial<DayOffImpact> = {}): DayOffImpact {
  return {
    requestId: 1,
    employeeName: 'Anna Lee',
    date: '2026-11-03',
    level: 'OK',
    summary: 'Safe to approve',
    workingBefore: 5,
    workingAfter: 4,
    neededThatDay: 3,
    replacementWorkDay: null,
    scheduleStatus: null,
    alreadyOff: [],
    alsoRequested: [],
    sameStoreOff: [],
    emergency: false,
    newShortages: [],
    existingShortages: 0,
    ...overrides,
  };
}

describe('approvalCard', () => {
  it('is a plain approval when stores stay covered', () => {
    const card = approvalCard(impact());
    expect(card.tone).toBe('success');
    expect(card.confirmText).toBe('Approve');
    expect(card.notes.join(' ')).toContain('working');
  });

  it('says nothing changes when the day was already their regular day off', () => {
    const card = approvalCard(impact({ workingBefore: 7, workingAfter: 7, neededThatDay: 5 }));
    expect(card.notes.join(' ')).toContain('7 working · 5 needed');
  });

  it('warns in red and lists the stores left short', () => {
    const card = approvalCard(
      impact({
        level: 'SHORT',
        newShortages: [{ storeName: 'Oceanside', date: '2026-11-03', scheduled: 1, required: 2 }],
        scheduleStatus: 'PUBLISHED',
      }),
    );
    expect(card.tone).toBe('danger');
    expect(card.confirmText).toBe('Approve anyway');
    expect(card.notes[0]).toContain('Oceanside: 1/2');
    expect(card.notes.join(' ')).toContain('Published week');
  });

  it('flags emergencies and colleagues off at the same store first', () => {
    const card = approvalCard(impact({ emergency: true, sameStoreOff: ['Ben Ito (waiting)'] }));
    expect(card.notes[0]).toContain('Same store off: Ben Ito (waiting)');
  });

  it('mentions who else is off and the day that becomes a work day', () => {
    const card = approvalCard(
      impact({
        level: 'TIGHT',
        alreadyOff: ['Ben Ito'],
        alsoRequested: ['Cara Diaz'],
        replacementWorkDay: '2026-11-05',
        scheduleStatus: 'DRAFT',
      }),
    );
    const text = card.notes.join(' ');
    expect(card.tone).toBe('warning');
    expect(text).toContain('Off: Ben Ito');
    expect(text).toContain('Also asked: Cara Diaz');
    expect(text).toContain('Anna works');
  });
});
