import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
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
} from '../../core/models';
import { formatHours, formatTime } from '../../core/store-hours';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';

@Component({
  selector: 'app-schedule-page',
  imports: [FormsModule, RouterLink, DatePipe, Modal],
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

  protected readonly dayTypes: DayType[] = ['WORK', 'OFF', 'REQUESTED_OFF'];
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

  protected readonly visibleRows = computed(() => {
    const rows = this.schedule()?.rows ?? [];
    const store = this.storeFilter();
    return store == null ? rows : rows.filter((r) => r.days.some((c) => c.type === 'WORK' && c.storeId === store));
  });

  protected readonly weekLabel = computed(() => formatWeekRange(this.weekStart()));
  protected readonly isDraft = computed(() => this.schedule()?.status === 'DRAFT');
  /** Managers and admins edit drafts; employees only ever see published weeks. */
  protected readonly canEdit = computed(() => this.auth.canManage() && this.isDraft());
  /** The signed-in person's own row, shown as a summary above the grid. */
  protected readonly myRow = computed(
    () => this.schedule()?.rows.find((r) => r.employeeId === this.auth.user()?.id) ?? null,
  );
  protected readonly selectedArea = computed(() => this.areas().find((a) => a.id === this.areaId()) ?? null);
  protected readonly mismatchCount = computed(
    () => this.schedule()?.rows.filter((r) => r.scheduledWorkDays !== r.expectedWorkDays).length ?? 0,
  );
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
        notes: ['Days you changed by hand and swaps on this draft will be lost.'],
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
      notes.push(`${s.pendingDayOffRequests} day-off request(s) for this week are still pending and are not included.`);
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
