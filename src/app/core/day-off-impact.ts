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
  if (impact.emergency) {
    notes.push('Emergency request: sent outside the usual one-per-store and weekly limits.');
  }
  if (impact.sameStoreOff.length) {
    notes.push(`Also off at the same store that day: ${impact.sameStoreOff.join(', ')}.`);
  }
  for (const g of impact.newShortages.slice(0, 3)) {
    notes.push(`${g.storeName} would have ${g.scheduled} of ${g.required} needed on ${dayLabel(g.date)}.`);
  }
  if (impact.newShortages.length > 3) {
    notes.push(`…and ${impact.newShortages.length - 3} more short store-days.`);
  }
  if (impact.workingAfter === impact.workingBefore) {
    notes.push(`No change to who works that day: ${impact.workingAfter} working; stores need ${impact.neededThatDay}.`);
  } else {
    notes.push(
      `${impact.workingAfter} working that day after approving (${impact.workingBefore} now); stores need ${impact.neededThatDay}.`,
    );
  }
  if (impact.alreadyOff.length) {
    notes.push(`Already off that day: ${impact.alreadyOff.join(', ')}.`);
  }
  if (impact.alsoRequested.length) {
    notes.push(`Also asked for this day: ${impact.alsoRequested.join(', ')} (waiting).`);
  }
  if (impact.replacementWorkDay) {
    notes.push(`${dayLabel(impact.replacementWorkDay)}, ${first}'s regular day off, becomes a work day so the week stays full.`);
  }
  if (impact.scheduleStatus === 'PUBLISHED') {
    notes.push('This week is already published. It will be updated, so let the team know.');
  } else if (impact.scheduleStatus === 'DRAFT') {
    notes.push('The draft schedule for that week will be updated right away.');
  } else {
    notes.push("That week isn't scheduled yet; the day off is used when you generate it.");
  }
  return {
    tone: impact.level === 'SHORT' ? 'danger' : impact.level === 'TIGHT' ? 'warning' : 'success',
    confirmText: impact.level === 'SHORT' ? 'Approve anyway' : 'Approve',
    notes,
  };
}
