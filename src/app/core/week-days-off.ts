import { formatDay } from './date-utils';
import { WeekDayOff } from './models';

const KIND: Record<WeekDayOff['kind'], string> = {
  REGULAR: 'regular day',
  SYSTEM: 'given by the system',
  ASKED: 'asked for',
  EMERGENCY: 'emergency',
};

/** "Mon, Nov 16 · regular day" (plus "waiting" when nobody has decided yet), for an emergency's week view. */
export function weekDayOffLabel(w: WeekDayOff): string {
  const day = formatDay(w.date, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${KIND[w.kind]}${w.status === 'PENDING' && (w.kind === 'ASKED' || w.kind === 'EMERGENCY') ? ', waiting' : ''}`;
}
