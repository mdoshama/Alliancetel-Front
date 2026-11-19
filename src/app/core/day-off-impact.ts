import { ConfirmTone } from './confirm.service';
import { formatDay } from './date-utils';
import { DayOffImpact, ImpactLevel } from './models';

export const IMPACT_BADGE: Record<ImpactLevel, { label: string; icon: string; css: string }> = {
  OK: { label: 'Covered', icon: 'bi-check-circle', css: 'impact-ok' },
  TIGHT: { label: 'No spare staff', icon: 'bi-exclamation-circle', css: 'impact-tight' },
  SHORT: { label: 'Leaves a store short', icon: 'bi-exclamation-triangle', css: 'impact-short' },
};

const dayLabel = (date: string) => formatDay(date, { weekday: 'short', month: 'short', day: 'numeric' });

/** Everything the approval card shows: the tone, the button text and the facts to weigh. */
export function approvalCard(impact: DayOffImpact): {
  tone: ConfirmTone;
  confirmText: string;
  notes: string[];
} {
  const first = impact.employeeName.split(' ')[0];
  const notes: string[] = [];
  if (impact.sameStoreOff.length) {
    notes.push(`Same store off: ${impact.sameStoreOff.join(', ')}`);
  }
  for (const g of impact.newShortages.slice(0, 3)) {
    notes.push(`${g.storeName}: ${g.scheduled}/${g.required} on ${dayLabel(g.date)}`);
  }
  if (impact.newShortages.length > 3) {
    notes.push(`+${impact.newShortages.length - 3} more short`);
  }
  notes.push(`${impact.workingAfter} working · ${impact.neededThatDay} needed`);
  if (impact.alreadyOff.length) {
    notes.push(`Off: ${impact.alreadyOff.join(', ')}`);
  }
  if (impact.alsoRequested.length) {
    notes.push(`Also asked: ${impact.alsoRequested.join(', ')}`);
  }
  if (impact.replacementWorkDay) {
    notes.push(`${first} works ${dayLabel(impact.replacementWorkDay)} (regular day)`);
  }
  if (impact.scheduleStatus === 'PUBLISHED') {
    notes.push('Published week: tell the team');
  }
  return {
    tone: impact.level === 'SHORT' ? 'danger' : impact.level === 'TIGHT' ? 'warning' : 'success',
    confirmText: impact.level === 'SHORT' ? 'Approve anyway' : 'Approve',
    notes,
  };
}
