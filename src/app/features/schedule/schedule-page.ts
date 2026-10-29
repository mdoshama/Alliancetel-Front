import { Component, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { matchesSearch } from '../../core/paging';
import { AuthService } from '../../core/auth.service';
import { addDays, formatDay, formatWeekRange, today, weekStartOf } from '../../core/date-utils';
import {
  Area,
  DAY_TYPE_LABELS,
  DayCell,
  DayHours,
  DayType,
  EmployeeRow,
  ROLE_LABELS,
  Schedule,
  STORE_ROLE_HELP,
  STORE_ROLE_LABELS,
  StoreRef,
  DayOffImpact,
  WeekRequest,
} from '../../core/models';
import { IMPACT_BADGE, approvalCard } from '../../core/day-off-impact';
import { formatHours, formatTime } from '../../core/store-hours';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';

const SCHEDULE_VIEW_KEY = 'alliancetel.scheduleView';

function readScheduleView(): 'people' | 'stores' {
  try {
    return localStorage.getItem(SCHEDULE_VIEW_KEY) === 'stores' ? 'stores' : 'people';
  } catch {
    return 'people';
  }
}

/** One person on one day, as shown in the "By store" view. */
interface StorePerson {
  row: EmployeeRow;
  dayIndex: number;
  cell: DayCell;
}

interface StoreBoardRow {
  storeId: number | null;
  name: string;
  color: string | null;
  min: number;
  cells: { people: StorePerson[]; hours: DayHours | null; closed: boolean; short: boolean }[];
}

@Component({
  selector: 'app-schedule-page',
  imports: [FormsModule, RouterLink, DatePipe, NgTemplateOutlet, Modal],
  templateUrl: './schedule-page.html',
})
export class SchedulePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);

  /** Query params: ?area=1&week=2026-11-02 */
  readonly area = input<string>();
  readonly week = input<string>();

  /** Days a manager can set by hand. Approved days off only come from approving a request. */
  protected readonly dayTypes: DayType[] = ['WORK', 'OFF'];
  protected readonly dayTypeLabels = DAY_TYPE_LABELS;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly todayIso = today();
  protected readonly format = formatDay;

  protected readonly areas = signal<Area[]>([]);
  protected readonly areaId = signal<number | null>(null);
  protected readonly weekStart = signal(weekStartOf(today()));
  protected readonly schedule = signal<Schedule | null>(null);
  protected readonly loading = signal(false);
  protected readonly working = signal(false);
  /** Show only people working at this store (null = everyone). */
  protected readonly storeFilter = signal<number | null>(null);

  // "Edit day" panel
  protected readonly editing = signal<{ row: EmployeeRow; dayIndex: number } | null>(null);
  protected readonly storeRoleLabels = STORE_ROLE_LABELS;
  protected readonly storeRoleHelp = STORE_ROLE_HELP;
  protected editType: DayType = 'WORK';
  protected editStoreId: number | null = null;
  protected readonly swapWith = signal<number | null>(null);
  protected weekStoreId: number | null = null;

  /** The cell being edited, re-read from the latest schedule after each change. */
  protected readonly editCell = computed(() => {
    const e = this.editing();
    const row = e && this.schedule()?.rows.find((r) => r.employeeId === e.row.employeeId);
    return e && row ? { row, cell: row.days[e.dayIndex], dayIndex: e.dayIndex } : null;
  });

  /** Colleagues on the same day who can trade assignments (approved days off can't be swapped away). */
  protected readonly swapCandidates = computed(() => {
    const e = this.editCell();
    const s = this.schedule();
    if (!e || !s) {
      return [];
    }
    return s.rows
      .filter((r) => r.employeeId !== e.row.employeeId)
      .map((r) => ({ row: r, cell: r.days[e.dayIndex] }))
      .filter((c) => c.cell.type !== 'REQUESTED_OFF')
      .filter((c) => c.cell.type !== e.cell.type || c.cell.storeId !== e.cell.storeId)
      .sort((a, b) => (a.cell.storeLabel ?? '~').localeCompare(b.cell.storeLabel ?? '~'));
  });

  /** Short-staffed store-days, grouped by date for the warning banner. */
  protected readonly gapsByDay = computed(() => {
    const gaps = this.schedule()?.coverageGaps ?? [];
    const days = new Map<string, typeof gaps>();
    for (const g of gaps) {
      days.set(g.date, [...(days.get(g.date) ?? []), g]);
    }
    return [...days.entries()].map(([date, list]) => ({ date, gaps: list }));
  });

  // ---------- "By store" view ----------
  // The same week, one row per store: who works where each day, coverage against the minimum, and who is off.

  protected readonly view = signal<'people' | 'stores'>(readScheduleView());

  protected setView(view: 'people' | 'stores'): void {
    this.view.set(view);
    try {
      localStorage.setItem(SCHEDULE_VIEW_KEY, view);
    } catch {
      // Storage can be unavailable (private mode); the choice just isn't remembered.
    }
  }

  protected readonly storeView = computed(() => {
    const s = this.schedule();
    if (!s) {
      return { stores: [] as StoreBoardRow[], off: [] as StorePerson[][] };
    }
    const filter = this.storeFilter();
    const byName = (a: StorePerson, b: StorePerson) =>
      Number(b.row.storeRole === 'PRIMARY') - Number(a.row.storeRole === 'PRIMARY') ||
      a.row.employeeName.localeCompare(b.row.employeeName);
    const stores: StoreBoardRow[] = s.storeCoverage
      .filter((c) => filter == null || c.storeId === filter)
      .map((c) => ({
        storeId: c.storeId,
        name: c.storeName,
        color: c.color,
        min: c.minStaffPerDay,
        cells: s.dates.map((_, i) => {
          const people = s.rows
            .filter((r) => r.days[i].type === 'WORK' && r.days[i].storeId === c.storeId)
            .map((r) => ({ row: r, dayIndex: i, cell: r.days[i] }))
            .sort(byName);
          const hours = c.dailyHours[i] ?? null;
          const closed = c.storeId !== null && !!hours?.closed;
          return {
            people,
            hours,
            closed,
            short: c.storeId !== null && !closed && people.length < c.minStaffPerDay,
          };
        }),
      }));
    const off = s.dates.map((_, i) =>
      s.rows
        .filter((r) => r.days[i].type !== 'WORK')
        .map((r) => ({ row: r, dayIndex: i, cell: r.days[i] }))
        .sort(byName),
    );
    return { stores, off };
  });

  /** "Maria Garcia" → "Maria G." for the compact store view. */
  protected shortName(name: string): string {
    const parts = name.trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  }

  /** A store cell accepts a work day (moved there, any day) or a day off on the same day (they work there). */
  protected canDropOnStoreCell(storeId: number | null, dayIndex: number): boolean {
    const d = this.drag();
    if (!d || storeId === null) {
      return false;
    }
    const from = d.row.days[d.dayIndex];
    if (from.type === 'OFF') {
      const coverage = this.schedule()?.storeCoverage.find((c) => c.storeId === storeId);
      return dayIndex === d.dayIndex && !coverage?.dailyHours[dayIndex]?.closed;
    }
    return this.canDropOnStore(storeId, dayIndex);
  }

  /** The "Off" row accepts a work day on the same day: that person gets the day off. */
  protected canDropOnOff(dayIndex: number): boolean {
    const d = this.drag();
    return !!d && d.dayIndex === dayIndex && d.row.days[dayIndex].type === 'WORK';
  }

  /** Over a person in the store view: swap with them if allowed, otherwise let the cell underneath decide. */
  protected onPersonDragOver(event: DragEvent, row: EmployeeRow, dayIndex: number): void {
    if (this.canDropOnPerson(row, dayIndex)) {
      event.stopPropagation();
      this.onDragOver(event, 'sp' + row.employeeId + '-' + dayIndex, true);
    }
  }

  protected async onPersonDrop(event: DragEvent, row: EmployeeRow, dayIndex: number): Promise<void> {
    if (this.canDropOnPerson(row, dayIndex)) {
      event.stopPropagation();
      await this.onDropOnPerson(event, row, dayIndex);
    }
  }

  protected async onDropOnStoreCell(event: DragEvent, storeId: number | null, dayIndex: number): Promise<void> {
    event.preventDefault();
    const d = this.drag();
    const ok = this.canDropOnStoreCell(storeId, dayIndex);
    this.onDragEnd();
    if (!d || !ok || storeId === null) {
      return;
    }
    if (d.row.days[d.dayIndex].type === 'OFF') {
      await this.setWorkDay(d.row, dayIndex, storeId);
    } else {
      await this.exchangeDays(d.row, d.dayIndex, d.row, dayIndex, storeId);
    }
  }

  protected async onDropOnOff(event: DragEvent, dayIndex: number): Promise<void> {
    event.preventDefault();
    const d = this.drag();
    const ok = this.canDropOnOff(dayIndex);
    this.onDragEnd();
    if (d && ok) {
      await this.setDayOff(d.row, dayIndex);
    }
  }

  /** Puts someone who was off to work at a store that day (one more work day for them). */
  private async setWorkDay(row: EmployeeRow, dayIndex: number, storeId: number): Promise<void> {
    const s = this.schedule();
    if (!s) {
      return;
    }
    const first = row.employeeName.split(' ')[0];
    const day = formatDay(s.dates[dayIndex], { weekday: 'long', month: 'short', day: 'numeric' });
    const store = s.stores.find((x) => x.id === storeId)?.name ?? 'the store';
    if (!(await this.confirmPrimaryMove(row, storeId, 'on ' + day, dayIndex))) {
      return;
    }
    const days = row.scheduledWorkDays + 1;
    if (days > row.expectedWorkDays) {
      const ok = await this.confirm.ask({
        title: `Give ${first} an extra work day?`,
        message: `${first} is off on ${day}. Working at ${store} makes it ${days} days this week (usually ${row.expectedWorkDays}).`,
        icon: 'bi-exclamation-triangle',
        tone: 'warning',
        confirmText: 'Add the day',
      });
      if (!ok) {
        return;
      }
    }
    this.run(
      this.api.updateScheduleEntry(s.id, row.days[dayIndex].entryId, 'WORK', storeId),
      `${first} now works at ${store} on ${day}.`,
    );
  }

  /** Gives someone the day off (one less work day for them). */
  private async setDayOff(row: EmployeeRow, dayIndex: number): Promise<void> {
    const s = this.schedule();
    if (!s) {
      return;
    }
    const first = row.employeeName.split(' ')[0];
    const day = formatDay(s.dates[dayIndex], { weekday: 'long', month: 'short', day: 'numeric' });
    const notes = [`${first} would work ${row.scheduledWorkDays - 1} days this week (usually ${row.expectedWorkDays}).`];
    const date = s.dates[dayIndex];
    const sameStoreOff = s.rows.filter(
      (x) =>
        x.employeeId !== row.employeeId &&
        row.homeStoreId != null &&
        x.homeStoreId === row.homeStoreId &&
        x.days.find((c) => c.date === date)?.type !== 'WORK',
    );
    if (sameStoreOff.length) {
      notes.push(
        `${sameStoreOff.map((x) => x.employeeName.split(' ')[0]).join(', ')} from ${row.homeStoreName} ${sameStoreOff.length > 1 ? 'are' : 'is'} already off that day.`,
      );
    }
    const ok = await this.confirm.ask({
      title: `Give ${first} ${day} off?`,
      message: 'They come off the schedule for that day.',
      icon: 'bi-calendar-x',
      tone: 'warning',
      notes,
      confirmText: 'Give the day off',
    });
    if (!ok) {
      return;
    }
    this.run(this.api.updateScheduleEntry(s.id, row.days[dayIndex].entryId, 'OFF', null), `${first} is off on ${day}.`);
  }

  protected readonly visibleRows = computed(() => {
    const rows = this.schedule()?.rows ?? [];
    const store = this.storeFilter();
    const q = this.personSearch();
    return rows.filter(
      (r) =>
        (store == null || r.days.some((c) => c.type === 'WORK' && c.storeId === store)) &&
        matchesSearch(q, r.employeeName, r.employeeCode),
    );
  });

  /** Finds people on the grid by name or code; in the By store view, others are dimmed. */
  protected readonly personSearch = signal('');

  protected isSearchMiss(row: EmployeeRow): boolean {
    const q = this.personSearch();
    return q.trim() !== '' && !matchesSearch(q, row.employeeName, row.employeeCode);
  }

  protected readonly weekLabel = computed(() => formatWeekRange(this.weekStart()));
  protected readonly isDraft = computed(() => this.schedule()?.status === 'DRAFT');
  /** Managers and admins edit drafts; employees only ever see published weeks. */
  protected readonly canEdit = computed(() => this.auth.canManage() && this.isDraft());
  /** The signed-in person's own row, shown as a summary above the grid. */
  protected readonly myRow = computed(
    () => this.schedule()?.rows.find((r) => r.employeeId === this.auth.user()?.id) ?? null,
  );
  protected readonly selectedArea = computed(() => this.areas().find((a) => a.id === this.areaId()) ?? null);
  /** People scheduled for fewer days than usual (e.g. two approved days off). */
  protected readonly mismatchCount = computed(
    () => this.schedule()?.rows.filter((r) => r.scheduledWorkDays < r.expectedWorkDays).length ?? 0,
  );
  /** People working more days than usual: nobody has given them a day off yet this week. */
  protected readonly noDayOff = computed(
    () => this.schedule()?.rows.filter((r) => r.scheduledWorkDays > r.expectedWorkDays) ?? [],
  );

  protected noDayOffNames(): string {
    const names = this.noDayOff().map((r) => r.employeeName.split(' ')[0]);
    return names.length > 6 ? `${names.slice(0, 6).join(', ')} and ${names.length - 6} more` : names.join(', ');
  }

  // ---- Day-off requests on the schedule -------------------------------------------------------------
  protected readonly impactBadge = IMPACT_BADGE;
  /** Staffing check per pending request, by request id. */
  protected readonly requestImpacts = signal<Map<number, DayOffImpact>>(new Map());
  /** Request being approved or rejected (or -1 for "approve all"). */
  protected readonly deciding = signal<number | null>(null);
  private impactSeq = 0;
  protected readonly reviewable = computed(() => this.schedule()?.requests.filter((r) => r.canReview) ?? []);
  /** Reviewable requests whose check says they keep every store covered. */
  protected readonly fitCount = computed(
    () => this.reviewable().filter((r) => this.requestImpacts().get(r.id)?.level !== 'SHORT').length,
  );

  /** Re-checks staffing for every pending request whenever the week changes. */
  private readonly impactLoader = effect(() => {
    const requests = this.reviewable();
    const seq = ++this.impactSeq;
    this.requestImpacts.set(new Map());
    for (const r of requests) {
      this.api.dayOffImpact(r.id).subscribe({
        next: (impact) => {
          if (seq === this.impactSeq) this.requestImpacts.update((m) => new Map(m).set(r.id, impact));
        },
        error: () => undefined,
      });
    }
  });

  protected requestDay(r: WeekRequest): string {
    return formatDay(r.date, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  /** The store the person works at on the requested day, for the requests list. */
  protected requestStore(r: WeekRequest): string | null {
    const row = this.schedule()?.rows.find((x) => x.employeeId === r.employeeId);
    const cell = row?.days.find((c) => c.date === r.date);
    return cell?.type === 'WORK' ? cell.storeName : null;
  }

  protected async approveRequest(r: WeekRequest): Promise<void> {
    const when = formatDay(r.date, { weekday: 'long', month: 'short', day: 'numeric' });
    this.deciding.set(r.id);
    let impact = this.requestImpacts().get(r.id);
    if (!impact) {
      impact = await new Promise<DayOffImpact | undefined>((resolve) =>
        this.api.dayOffImpact(r.id).subscribe({ next: resolve, error: () => resolve(undefined) }),
      );
    }
    const card = impact ? approvalCard(impact) : { tone: 'success' as const, confirmText: 'Approve', notes: [] };
    const ok = await this.confirm.ask({
      title: `Approve ${r.employeeName.split(' ')[0]}'s day off?`,
      message: `${r.employeeName} asked for ${when} off${r.reason ? ` (“${r.reason}”)` : ''}.`,
      icon: 'bi-calendar-check',
      tone: card.tone,
      notes: card.notes,
      confirmText: card.confirmText,
    });
    if (!ok) {
      this.deciding.set(null);
      return;
    }
    this.api.approveDayOff(r.id).subscribe({
      next: (res) => {
        this.deciding.set(null);
        this.toast.success(res.scheduleUpdate ?? `Approved ${r.employeeName}'s day off.`);
        this.load();
      },
      error: () => this.deciding.set(null),
    });
  }

  protected async rejectRequest(r: WeekRequest): Promise<void> {
    const note = await this.confirm.askWithInput({
      title: 'Reject day off?',
      message: `${r.employeeName} asked for ${formatDay(r.date, { weekday: 'long', month: 'short', day: 'numeric' })} off.`,
      icon: 'bi-x-circle',
      tone: 'danger',
      input: { label: 'Reason (optional, shown to the employee)', placeholder: 'e.g. Short-staffed that day' },
      confirmText: 'Reject request',
    });
    if (note === null) {
      return;
    }
    this.deciding.set(r.id);
    this.api.rejectDayOff(r.id, note || undefined).subscribe({
      next: () => {
        this.deciding.set(null);
        this.toast.info(`Rejected ${r.employeeName}'s request. They keep working that day.`);
        this.load();
      },
      error: () => this.deciding.set(null),
    });
  }

  /** Approves every request that keeps the stores covered, checked one after another; the rest stay pending. */
  protected async approveAllThatFit(): Promise<void> {
    const list = this.reviewable();
    if (list.length === 0) {
      return;
    }
    const impacts = this.requestImpacts();
    const short = list.filter((r) => impacts.get(r.id)?.level === 'SHORT');
    const notes = list.slice(0, 8).map((r) => {
      const level = impacts.get(r.id)?.level;
      const tag = level === 'SHORT' ? ' (would leave a store short, stays pending)' : level === 'TIGHT' ? ' (no spare staff)' : '';
      return `${r.employeeName} · ${this.requestDay(r)}${r.emergency ? ' · emergency' : ''}${tag}`;
    });
    if (list.length > 8) notes.push(`…and ${list.length - 8} more.`);
    notes.push('Checked one at a time, earliest day first, so two people are never approved off when the stores can spare only one.');
    const ok = await this.confirm.ask({
      title: 'Approve all that fit?',
      message:
        short.length === 0
          ? `All ${list.length} request(s) this week keep every store at its minimum.`
          : `${list.length - short.length} of ${list.length} request(s) keep every store covered. The others stay pending for you to decide.`,
      icon: 'bi-check2-all',
      tone: 'success',
      notes,
      confirmText: 'Approve all that fit',
    });
    if (!ok) {
      return;
    }
    this.deciding.set(-1);
    this.api.approveManyDaysOff(list.map((r) => r.id), true).subscribe({
      next: (res) => {
        this.deciding.set(null);
        const n = res.approved.length;
        if (res.skipped.length === 0) {
          this.toast.success(`Approved ${n} day${n === 1 ? '' : 's'} off. The schedule is updated.`);
        } else {
          const names = res.skipped.map((x) => `${x.employeeName.split(' ')[0]} (${formatDay(x.date, { weekday: 'short' })})`);
          this.toast.info(`Approved ${n}. Left pending because a store would be short: ${names.join(', ')}.`);
        }
        this.load();
      },
      error: () => this.deciding.set(null),
    });
  }
  /** Number of work days the scheduler moved to another store to cover a minimum. */
  protected readonly autoMoves = computed(
    () => this.schedule()?.rows.reduce((n, r) => n + r.days.filter((c) => c.autoAssigned).length, 0) ?? 0,
  );
  protected readonly totalShifts = computed(
    () => this.schedule()?.dailyHeadCount.reduce((sum, n) => sum + n, 0) ?? 0,
  );

  ngOnInit(): void {
    const week = this.week();
    if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
      this.weekStart.set(weekStartOf(week));
    }
    this.api.areas().subscribe((list) => {
      const active = list.filter((a) => a.active);
      this.areas.set(active);
      const requested = Number(this.area());
      const initial = active.find((a) => a.id === requested) ?? active[0];
      if (initial) {
        this.areaId.set(initial.id);
        this.load();
      }
    });
  }

  protected selectArea(id: number | null): void {
    this.areaId.set(id);
    this.load();
  }

  protected shiftWeek(weeks: number): void {
    this.weekStart.update((w) => addDays(w, weeks * 7));
    this.load();
  }

  protected goToThisWeek(): void {
    this.weekStart.set(weekStartOf(today()));
    this.load();
  }

  protected jumpTo(date: string): void {
    if (date) {
      this.weekStart.set(weekStartOf(date));
      this.load();
    }
  }

  protected load(): void {
    const areaId = this.areaId();
    if (areaId == null) {
      return;
    }
    this.syncUrl();
    this.editing.set(null);
    this.storeFilter.set(null);
    this.personSearch.set('');
    this.loading.set(true);
    this.api.schedule(areaId, this.weekStart()).subscribe({
      next: (s) => {
        this.schedule.set(s);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected async generate(): Promise<void> {
    const areaId = this.areaId();
    if (areaId == null) {
      return;
    }
    const existing = this.schedule();
    if (
      existing &&
      !(await this.confirm.ask({
        title: 'Rebuild this week?',
        message: `The ${existing.areaName} draft for ${this.weekLabel()} will be built again from scratch.`,
        icon: 'bi-arrow-repeat',
        tone: 'warning',
        notes: [
          'Days you changed by hand and swaps on this draft will be lost.',
          'Everyone starts working every day the stores are open; only approved requests are days off.',
        ],
        confirmText: 'Rebuild',
      }))
    ) {
      return;
    }
    this.run(this.api.generateSchedule(areaId, this.weekStart()), existing ? 'Schedule regenerated.' : 'Schedule generated.');
  }

  /** Re-runs automatic store assignment and reports how the gaps changed. */
  protected autoFill(): void {
    const s = this.schedule();
    if (!s) {
      return;
    }
    const before = s.coverageGaps.length;
    this.working.set(true);
    this.api.autoAssignStores(s.id).subscribe({
      next: (updated) => {
        this.schedule.set(updated);
        this.working.set(false);
        const after = updated.coverageGaps.length;
        if (after === 0) {
          this.toast.success('Stores filled: every store meets its minimum.');
        } else if (after < before) {
          this.toast.info(`Filled ${before - after} gap(s). ${after} remain because not enough people work those days.`);
        } else {
          this.toast.info(`Stores re-assigned. ${after} gap(s) remain because not enough people work those days.`);
        }
      },
      error: () => this.working.set(false),
    });
  }

  protected async publish(): Promise<void> {
    const s = this.schedule();
    if (!s) {
      return;
    }
    const notes: string[] = [];
    if (s.pendingDayOffRequests > 0) {
      notes.push(`${s.pendingDayOffRequests} day-off request(s) are still pending; those people are scheduled to work.`);
    }
    if (this.noDayOff().length > 0) {
      notes.push(`${this.noDayOff().length} people have no day off this week: ${this.noDayOffNames()}.`);
    }
    if (s.coverageGaps.length > 0) {
      notes.push(`${s.coverageGaps.length} store-day(s) are below their minimum staffing.`);
    }
    const ok = await this.confirm.ask({
      title: 'Publish schedule?',
      message: `The ${s.areaName} schedule for ${this.weekLabel()} will become visible to all ${s.rows.length} staff and locked for editing.`,
      icon: 'bi-send-check',
      tone: notes.length ? 'warning' : 'primary',
      notes,
      confirmText: notes.length ? 'Publish anyway' : 'Publish',
    });
    if (!ok) {
      return;
    }
    this.run(this.api.publishSchedule(s.id), 'Schedule published.');
  }

  protected async revert(): Promise<void> {
    const s = this.schedule();
    if (
      s &&
      (await this.confirm.ask({
        title: 'Move back to draft?',
        message: `The ${s.areaName} schedule for ${this.weekLabel()} will be hidden from staff until you publish it again.`,
        icon: 'bi-unlock',
        confirmText: 'Move to draft',
      }))
    ) {
      this.run(this.api.revertSchedule(s.id), 'Schedule moved back to draft.');
    }
  }

  /** True when a store has fewer people than its minimum on that day of the week. */
  protected isShort(storeId: number | null, minStaffPerDay: number, scheduled: number): boolean {
    return storeId !== null && scheduled < minStaffPerDay;
  }

  /** Whether any store is short-staffed on the given date (for the red dot in the day header). */
  protected dayHasGap(date: string): boolean {
    return (this.schedule()?.coverageGaps ?? []).some((g) => g.date === date);
  }

  /** "1/2" head count for a store on the day being edited, shown in the store pickers. */
  protected storeCount(storeId: number, dayIndex: number): string {
    const c = this.schedule()?.storeCoverage.find((x) => x.storeId === storeId);
    if (!c) {
      return '';
    }
    const n = c.dailyHeadCount[dayIndex];
    return c.minStaffPerDay > 0 ? `${n}/${c.minStaffPerDay}${n < c.minStaffPerDay ? ' · short' : ''}` : `${n}`;
  }

  /** "Maria Garcia" → "MG". */
  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  /** Hover text for a person: code, role at their store and what that means. */
  protected personTitle(row: EmployeeRow): string {
    const where = row.homeStoreName ? ` at ${row.homeStoreName}` : '';
    return `${row.employeeName} (${row.employeeCode}) · ${this.storeRoleLabels[row.storeRole]}${where}: ${this.storeRoleHelp[row.storeRole]}`;
  }

  /** A store's color, for the home-store chip. */
  protected storeColor(storeId: number | null): string | null {
    return storeId == null ? null : (this.schedule()?.stores.find((x) => x.id === storeId)?.color ?? null);
  }

  /** "10am–8pm", or "Closed". */
  protected hoursLabel(h: DayHours): string {
    return formatHours(h);
  }

  /** The shift for a work day, which follows the store's hours that day. */
  protected shiftHours(cell: DayCell): string {
    return cell.opensAt && cell.closesAt ? `${formatTime(cell.opensAt)}–${formatTime(cell.closesAt)}` : '';
  }

  /** The store's hours on the given day of this week (index 0 = Monday). */
  private storeHoursOn(store: StoreRef, dayIndex: number): DayHours | undefined {
    const day = this.schedule()?.dates[dayIndex];
    if (!day) {
      return undefined;
    }
    const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][
      new Date(day + 'T00:00:00').getDay()
    ];
    return store.hours?.find((h) => h.day === weekday);
  }

  protected storeClosedOn(store: StoreRef, dayIndex: number): boolean {
    return !!this.storeHoursOn(store, dayIndex)?.closed;
  }

  /** Shown next to each store in the pickers, e.g. "10am–8pm · 1/2 · short that day". */
  protected storeOptionNote(store: StoreRef, dayIndex: number): string {
    const h = this.storeHoursOn(store, dayIndex);
    if (h?.closed) {
      return 'closed that day';
    }
    return `${h ? formatHours(h) + ' · ' : ''}${this.storeCount(store.id, dayIndex)} that day`;
  }

  /** Greys out cells at other stores when a store filter is on. */
  protected dimmed(cell: DayCell): boolean {
    const store = this.storeFilter();
    return store != null && (cell.type !== 'WORK' || cell.storeId !== store);
  }

  protected chipLabel(cell: DayCell): string {
    return cell.type === 'WORK' ? (cell.storeName ?? 'No store') : this.dayTypeLabels[cell.type];
  }

  protected openCell(row: EmployeeRow, dayIndex: number): void {
    if (!this.canEdit()) {
      return;
    }
    const cell = row.days[dayIndex];
    if (cell.type === 'REQUESTED_OFF') {
      const day = formatDay(cell.date, { weekday: 'long', month: 'short', day: 'numeric' });
      this.toast.info(`${row.employeeName.split(' ')[0]} has an approved day off on ${day}. It stays off.`);
      return;
    }
    this.editType = cell.type;
    this.editStoreId = cell.storeId ?? this.openHomeStore(row, dayIndex);
    this.weekStoreId = cell.storeId ?? row.homeStoreId;
    this.swapWith.set(null);
    this.editing.set({ row, dayIndex });
  }

  protected closeEditor(): void {
    this.editing.set(null);
  }

  /** The person's home store if it is open on that day; otherwise a store has to be picked. */
  private openHomeStore(row: EmployeeRow, dayIndex: number): number | null {
    const home = this.schedule()?.stores.find((st) => st.id === row.homeStoreId);
    return home && !this.storeClosedOn(home, dayIndex) ? home.id : null;
  }

  /** A work day must have a store whenever the area has stores. */
  protected storeMissing(): boolean {
    return this.editType === 'WORK' && this.editStoreId === null && (this.schedule()?.stores.length ?? 0) > 0;
  }

  protected async saveDay(): Promise<void> {
    if (this.storeMissing()) {
      return;
    }
    const s = this.schedule();
    const e = this.editCell();
    if (!s || !e) {
      return;
    }
    const storeId = this.editType === 'WORK' ? this.editStoreId : null;
    if (this.editType === e.cell.type && storeId === e.cell.storeId) {
      this.closeEditor();
      return;
    }
    const when = 'on ' + formatDay(e.cell.date, { weekday: 'long', month: 'short', day: 'numeric' });
    if (!(await this.confirmPrimaryMove(e.row, storeId, when, e.dayIndex))) {
      return;
    }
    this.run(this.api.updateScheduleEntry(s.id, e.cell.entryId, this.editType, storeId), 'Day updated.', true);
  }

  protected async swap(): Promise<void> {
    const s = this.schedule();
    const e = this.editCell();
    const other = this.swapCandidates().find((c) => c.cell.entryId === this.swapWith());
    if (!s || !e || !other) {
      return;
    }
    // After a swap each person takes the other's store; warn if that pulls a primary away from home.
    const when = 'on ' + formatDay(e.cell.date, { weekday: 'long', month: 'short', day: 'numeric' });
    const newStoreForMe = other.cell.type === 'WORK' ? other.cell.storeId : null;
    const newStoreForOther = e.cell.type === 'WORK' ? e.cell.storeId : null;
    if (
      !(await this.confirmPrimaryMove(e.row, newStoreForMe, when, e.dayIndex)) ||
      !(await this.confirmPrimaryMove(other.row, newStoreForOther, when, e.dayIndex))
    ) {
      return;
    }
    this.run(
      this.api.swapEntries(s.id, e.cell.entryId, other.cell.entryId),
      `Swapped ${e.row.employeeName} and ${other.row.employeeName} on ${formatDay(e.cell.date, { weekday: 'long' })}.`,
      true,
    );
  }

  protected async moveWeek(): Promise<void> {
    const s = this.schedule();
    const e = this.editCell();
    if (!s || !e || this.weekStoreId == null) {
      return;
    }
    if (!(await this.confirmPrimaryMove(e.row, this.weekStoreId, 'for the whole week', null))) {
      return;
    }
    const store = s.stores.find((x) => x.id === this.weekStoreId);
    this.run(
      this.api.moveForWeek(s.id, e.row.employeeId, this.weekStoreId),
      `${e.row.employeeName} works at ${store?.name ?? 'the selected store'} all week.`,
      true,
    );
  }

  // ---------- Drag and drop ----------
  // Drop a day on a colleague's box in the same column to swap, or on a store's row to move the person there.
  // Clicking a day still opens the editor (and is the way to edit on touch screens).

  protected readonly drag = signal<{ row: EmployeeRow; dayIndex: number } | null>(null);
  protected readonly dropKey = signal<string | null>(null);

  protected canDrag(cell: DayCell): boolean {
    return this.canEdit() && !this.working() && cell.type !== 'REQUESTED_OFF';
  }

  protected isDragSource(row: EmployeeRow, dayIndex: number): boolean {
    const d = this.drag();
    return d !== null && d.row.employeeId === row.employeeId && d.dayIndex === dayIndex;
  }

  /** Any day box can be dropped on any other one (any person, any day) unless nothing would change. */
  protected canDropOnPerson(row: EmployeeRow, dayIndex: number): boolean {
    const d = this.drag();
    if (!d || (d.row.employeeId === row.employeeId && d.dayIndex === dayIndex)) {
      return false;
    }
    const from = d.row.days[d.dayIndex];
    const to = row.days[dayIndex];
    if (to.type === 'REQUESTED_OFF') {
      return false;
    }
    return !(from.type === to.type && from.storeId === to.storeId);
  }

  /** A work day can be dropped on any open day of any store's row: the shift moves to that day and store. */
  protected canDropOnStore(storeId: number | null, dayIndex: number): boolean {
    const d = this.drag();
    if (!d || storeId === null) {
      return false;
    }
    const from = d.row.days[d.dayIndex];
    const target = d.row.days[dayIndex];
    const coverage = this.schedule()?.storeCoverage.find((c) => c.storeId === storeId);
    if (from.type !== 'WORK' || coverage?.dailyHours[dayIndex]?.closed) {
      return false;
    }
    if (dayIndex === d.dayIndex) {
      return from.storeId !== storeId;
    }
    return target.type !== 'REQUESTED_OFF';
  }

  protected onDragStart(event: DragEvent, row: EmployeeRow, dayIndex: number): void {
    if (!this.canDrag(row.days[dayIndex])) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData('text/plain', `${row.employeeId}:${dayIndex}`);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    this.drag.set({ row, dayIndex });
  }

  protected onDragEnd(): void {
    this.drag.set(null);
    this.dropKey.set(null);
  }

  protected onDragOver(event: DragEvent, key: string, allowed: boolean): void {
    if (!allowed) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    if (this.dropKey() !== key) {
      this.dropKey.set(key);
    }
  }

  protected onDragLeave(key: string): void {
    if (this.dropKey() === key) {
      this.dropKey.set(null);
    }
  }

  protected async onDropOnPerson(event: DragEvent, row: EmployeeRow, dayIndex: number): Promise<void> {
    event.preventDefault();
    const d = this.drag();
    const ok = this.canDropOnPerson(row, dayIndex);
    this.onDragEnd();
    if (d && ok) {
      await this.exchangeDays(d.row, d.dayIndex, row, dayIndex);
    }
  }

  protected async onDropOnStore(event: DragEvent, storeId: number | null, dayIndex: number): Promise<void> {
    event.preventDefault();
    const d = this.drag();
    const ok = this.canDropOnStore(storeId, dayIndex);
    this.onDragEnd();
    if (d && ok && storeId !== null) {
      await this.exchangeDays(d.row, d.dayIndex, d.row, dayIndex, storeId);
    }
  }

  /**
   * The dragged day and the day it was dropped on trade places. With a store (a drop on a store's row), the dragged
   * work day lands at that store. Asks first if the change takes a primary away from their store, changes how many
   * days someone works, or leaves two people from one store off on the same day.
   */
  private async exchangeDays(
    fromRow: EmployeeRow,
    fromIndex: number,
    toRow: EmployeeRow,
    toIndex: number,
    storeId?: number,
  ): Promise<void> {
    const s = this.schedule();
    if (!s) {
      return;
    }
    const from = fromRow.days[fromIndex];
    const to = toRow.days[toIndex];
    const sameCell = fromRow.employeeId === toRow.employeeId && fromIndex === toIndex;
    const day = (i: number) => formatDay(s.dates[i], { weekday: 'long', month: 'short', day: 'numeric' });
    const first = (r: EmployeeRow) => r.employeeName.split(' ')[0];
    const storeName = (id: number | null) => s.stores.find((x) => x.id === id)?.name ?? 'no store';

    // What each person ends up doing.
    const landing = { row: toRow, index: toIndex, type: from.type, storeId: storeId ?? from.storeId };
    const leaving = sameCell ? null : { row: fromRow, index: fromIndex, type: to.type, storeId: to.storeId };

    // 1. Primaries taken away from their store.
    for (const r of [landing, leaving]) {
      if (r && r.type === 'WORK' && !(await this.confirmPrimaryMove(r.row, r.storeId, 'on ' + day(r.index), r.index))) {
        return;
      }
    }

    // 2. Anything else worth a second look.
    const notes: string[] = [];
    if (leaving && fromRow.employeeId !== toRow.employeeId && from.type !== to.type) {
      const delta = (to.type === 'WORK' ? 1 : 0) - (from.type === 'WORK' ? 1 : 0);
      const fromDays = fromRow.scheduledWorkDays + delta;
      const toDays = toRow.scheduledWorkDays - delta;
      notes.push(
        `${first(fromRow)} would work ${fromDays} day${fromDays === 1 ? '' : 's'} and ${first(toRow)} ${toDays} ` +
          `(usually ${fromRow.expectedWorkDays} and ${toRow.expectedWorkDays}).`,
      );
    }
    for (const r of [landing, leaving]) {
      if (!r || r.type === 'WORK' || r.row.homeStoreId == null) {
        continue;
      }
      const date = s.dates[r.index];
      const others = s.rows.filter(
        (x) =>
          x.employeeId !== fromRow.employeeId &&
          x.employeeId !== toRow.employeeId &&
          x.homeStoreId === r.row.homeStoreId &&
          x.days.find((c) => c.date === date)?.type !== 'WORK',
      );
      if (others.length) {
        notes.push(
          `${others.map(first).join(', ')} ${others.length > 1 ? 'are' : 'is'} already off at ${r.row.homeStoreName} on ` +
            `${day(r.index)}, so ${first(r.row)} would be off there too.`,
        );
      }
    }
    if (notes.length) {
      const ok = await this.confirm.ask({
        title: 'Make this change?',
        message: 'This swap changes more than where people work.',
        icon: 'bi-exclamation-triangle',
        tone: 'warning',
        notes,
        confirmText: 'Swap anyway',
      });
      if (!ok) {
        return;
      }
    }

    let message: string;
    if (sameCell) {
      message = `${fromRow.employeeName} moved to ${storeName(storeId ?? null)} on ${day(fromIndex)}.`;
    } else if (storeId !== undefined) {
      message = `${first(fromRow)}'s shift moved to ${storeName(storeId)} on ${day(toIndex)}.`;
    } else if (fromRow.employeeId === toRow.employeeId) {
      message = `${first(fromRow)}'s ${formatDay(s.dates[fromIndex], { weekday: 'long' })} and ${formatDay(s.dates[toIndex], { weekday: 'long' })} swapped.`;
    } else if (fromIndex === toIndex) {
      message = `Swapped ${fromRow.employeeName} and ${toRow.employeeName} on ${formatDay(s.dates[fromIndex], { weekday: 'long' })}.`;
    } else {
      message = `Swapped ${first(fromRow)}'s ${formatDay(s.dates[fromIndex], { weekday: 'long' })} with ${first(toRow)}'s ${formatDay(s.dates[toIndex], { weekday: 'long' })}.`;
    }
    this.run(this.api.exchangeDays(s.id, from.entryId, to.entryId, storeId), message);
  }

  /**
   * Primaries stay at their home store unless a manager deliberately moves them, so ask first.
   * Resolves true when it is fine to go ahead (not a primary, staying home, or the manager confirmed).
   */
  private confirmPrimaryMove(
    row: EmployeeRow,
    storeId: number | null,
    when: string,
    dayIndex: number | null,
  ): Promise<boolean> {
    if (row.storeRole !== 'PRIMARY' || storeId == null || storeId === row.homeStoreId) {
      return Promise.resolve(true);
    }
    const first = row.employeeName.split(' ')[0];
    const home = row.homeStoreName ?? 'their store';
    const to = this.schedule()?.stores.find((x) => x.id === storeId)?.name ?? 'another store';
    const notes = [
      `Generate and Auto-fill never move a primary. This is kept as a manual change.`,
    ];
    if (dayIndex !== null && row.homeStoreId != null) {
      const cov = this.schedule()?.storeCoverage.find((c) => c.storeId === row.homeStoreId);
      if (cov) {
        const left = cov.dailyHeadCount[dayIndex] - 1;
        notes.unshift(
          cov.minStaffPerDay > 0
            ? `${home} would have ${left} of ${cov.minStaffPerDay} needed that day.`
            : `${home} would have ${left} working that day.`,
        );
      }
    }
    return this.confirm.ask({
      title: `Move ${first} away from ${home}?`,
      message: `${first} is the primary at ${home}. Moving them to ${to} ${when} takes ${home}'s primary away.`,
      icon: 'bi-exclamation-triangle',
      tone: 'warning',
      notes,
      confirmText: `Move to ${to}`,
    });
  }

  /** Plain-language description of a cell, e.g. "Work at Oceanside". */
  protected describe(cell: DayCell): string {
    if (cell.type !== 'WORK') {
      return this.dayTypeLabels[cell.type];
    }
    const shift = this.shiftHours(cell);
    const where = cell.storeName
      ? `Work at ${cell.storeName}${cell.storeClosed ? ' (store closed that day)' : shift ? ', ' + shift : ''}`
      : 'Work (no store)';
    return cell.autoAssigned ? `${where} (moved automatically to cover the minimum)` : where;
  }

  private run(request: ReturnType<ApiService['generateSchedule']>, successMessage?: string, closeEditor = false): void {
    this.working.set(true);
    request.subscribe({
      next: (s) => {
        this.schedule.set(s);
        this.working.set(false);
        if (closeEditor) {
          this.closeEditor();
        }
        if (successMessage) {
          this.toast.success(successMessage);
        }
      },
      error: () => this.working.set(false),
    });
  }

  private syncUrl(): void {
    this.router.navigate([], {
      queryParams: { area: this.areaId(), week: this.weekStart() },
      replaceUrl: true,
    });
  }
}
