import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { addDays, formatDay, formatWeekRange, today, weekStartOf } from '../../core/date-utils';
import { Area, DAY_TYPE_LABELS, DayCell, DayType, EmployeeRow, ROLE_LABELS, Schedule } from '../../core/models';
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

  /** Greys out cells at other stores when a store filter is on. */
  protected dimmed(cell: DayCell): boolean {
    const store = this.storeFilter();
    return store != null && (cell.type !== 'WORK' || cell.storeId !== store);
  }

  protected chipLabel(cell: DayCell): string {
    return cell.type === 'WORK' ? (cell.storeLabel ?? 'No store') : this.dayTypeLabels[cell.type];
  }

  protected openCell(row: EmployeeRow, dayIndex: number): void {
    if (!this.canEdit()) {
      return;
    }
    const cell = row.days[dayIndex];
    this.editType = cell.type;
    this.editStoreId = cell.storeId ?? row.homeStoreId;
    this.weekStoreId = cell.storeId ?? row.homeStoreId;
    this.swapWith.set(null);
    this.editing.set({ row, dayIndex });
  }

  protected closeEditor(): void {
    this.editing.set(null);
  }

  protected saveDay(): void {
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
    this.run(this.api.updateScheduleEntry(s.id, e.cell.entryId, this.editType, storeId), 'Day updated.', true);
  }

  protected swap(): void {
    const s = this.schedule();
    const e = this.editCell();
    const other = this.swapCandidates().find((c) => c.cell.entryId === this.swapWith());
    if (!s || !e || !other) {
      return;
    }
    this.run(
      this.api.swapEntries(s.id, e.cell.entryId, other.cell.entryId),
      `Swapped ${e.row.employeeName} and ${other.row.employeeName} on ${formatDay(e.cell.date, { weekday: 'long' })}.`,
      true,
    );
  }

  protected moveWeek(): void {
    const s = this.schedule();
    const e = this.editCell();
    if (!s || !e || this.weekStoreId == null) {
      return;
    }
    const store = s.stores.find((x) => x.id === this.weekStoreId);
    this.run(
      this.api.moveForWeek(s.id, e.row.employeeId, this.weekStoreId),
      `${e.row.employeeName} works at ${store?.name ?? 'the selected store'} all week.`,
      true,
    );
  }

  /** Plain-language description of a cell, e.g. "Work at Oceanside". */
  protected describe(cell: DayCell): string {
    if (cell.type !== 'WORK') {
      return this.dayTypeLabels[cell.type];
    }
    const where = cell.storeName ? `Work at ${cell.storeName}` : 'Work (no store)';
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
