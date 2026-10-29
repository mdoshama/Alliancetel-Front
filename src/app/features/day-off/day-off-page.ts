import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { addDays, formatDay, formatWeekRange, today, weekDates, weekStartOf } from '../../core/date-utils';
import { Area, DayOffImpact, DayOffRequest, DayOffStatus, Employee, TakenDay } from '../../core/models';
import { IMPACT_BADGE, approvalCard } from '../../core/day-off-impact';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';
import { Pagination } from '../../shared/pagination';
import { matchesSearch, savePageSize, savedPageSize } from '../../core/paging';

type StatusTab = DayOffStatus | 'ALL';

@Component({
  selector: 'app-day-off-page',
  imports: [FormsModule, RouterLink, Modal, TitleCasePipe, Pagination],
  templateUrl: './day-off-page.html',
})
export class DayOffPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);

  protected readonly maxDaysPerWeek = 2;
  protected readonly tabs: { value: StatusTab; label: string }[] = [
    { value: 'PENDING', label: 'Pending' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'ALL', label: 'All' },
  ];

  protected readonly areas = signal<Area[]>([]);
  protected readonly requests = signal<DayOffRequest[]>([]);
  protected readonly loading = signal(true);
  protected readonly busyId = signal<number | null>(null);
  /** Staffing check for each pending request the user can review, by request id. */
  protected readonly impacts = signal<Map<number, DayOffImpact>>(new Map());
  protected readonly impactBadge = IMPACT_BADGE;

  protected readonly status = signal<StatusTab>('PENDING');
  protected areaFilter: number | null = null;
  protected fromFilter = weekStartOf(today());
  protected toFilter = '';
  /** Employee name or code. */
  protected search = '';
  protected readonly page = signal(0);
  protected readonly pageSize = signal(savedPageSize());
  protected readonly total = signal(0);
  private loadSeq = 0;
  private searchTimer?: ReturnType<typeof setTimeout>;

  // New request modal
  protected readonly modalOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formArea = signal<number | null>(null);
  protected readonly formEmployees = signal<Employee[]>([]);
  protected readonly formEmployeeId = signal<number | null>(null);
  /** Narrows the employee picker; the chosen person always stays in the list. */
  protected readonly formSearch = signal('');
  protected readonly formEmployeeChoices = computed(() => {
    const q = this.formSearch();
    const chosen = this.formEmployeeId();
    return this.formEmployees().filter((e) => e.id === chosen || matchesSearch(q, e.fullName, e.employeeCode));
  });
  protected readonly formWeek = signal(addDays(weekStartOf(today()), 7));
  protected readonly formDays = signal<Set<string>>(new Set());
  protected formReason = '';
  /** Urgent request: lifts the one-per-store and weekly limits (still needs approval). */
  protected readonly formEmergency = signal(false);
  /** Days in the chosen week a colleague at the same store already has off, by date → first name. */
  protected readonly formTaken = signal<Map<string, TakenDay>>(new Map());
  protected readonly formMaxDays = computed(() => (this.formEmergency() ? 7 : this.maxDaysPerWeek));

  protected readonly formWeekDates = computed(() => weekDates(this.formWeek()));
  protected readonly formWeekLabel = computed(() => formatWeekRange(this.formWeek()));
  protected readonly todayIso = today();

  protected readonly format = formatDay;

  ngOnInit(): void {
    this.api.areas().subscribe((list) => this.areas.set(list));
    this.load();
  }

  protected setTab(tab: StatusTab): void {
    this.status.set(tab);
    this.applyFilters();
  }

  /** A filter changed: start again from the first page. */
  protected applyFilters(): void {
    clearTimeout(this.searchTimer);
    this.page.set(0);
    this.load();
  }

  protected onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applyFilters(), 300);
  }

  protected goToPage(page: number): void {
    this.page.set(page);
    this.load();
    document.querySelector('.requests-card')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  protected changePageSize(size: number): void {
    savePageSize(size);
    this.pageSize.set(size);
    this.applyFilters();
  }

  /** Reloads the current page. */
  protected load(): void {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    const status = this.status();
    this.api
      .dayOffRequestsPage({
        areaId: this.areaFilter,
        status: status === 'ALL' ? null : status,
        from: this.fromFilter || null,
        to: this.toFilter || null,
        q: this.search.trim() || null,
        page: this.page(),
        size: this.pageSize(),
      })
      .subscribe({
        next: (result) => {
          if (seq !== this.loadSeq) return;
          // Approving the last pending request on the last page: step back a page.
          if (result.content.length === 0 && result.page > 0 && result.totalElements > 0) {
            this.page.set(Math.max(0, result.totalPages - 1));
            this.load();
            return;
          }
          this.requests.set(result.content);
          this.total.set(result.totalElements);
          this.loading.set(false);
          this.loadImpacts(result.content);
        },
        error: () => {
          if (seq === this.loadSeq) this.loading.set(false);
        },
      });
  }

  /** Checks staffing for every pending request the user may approve, so problems show before deciding. */
  private loadImpacts(list: DayOffRequest[]): void {
    this.impacts.set(new Map());
    for (const r of list) {
      if (r.status === 'PENDING' && this.canReview(r)) {
        this.api.dayOffImpact(r.id).subscribe({
          next: (impact) => this.impacts.update((m) => new Map(m).set(r.id, impact)),
          error: () => undefined,
        });
      }
    }
  }

  protected async approve(r: DayOffRequest): Promise<void> {
    const when = formatDay(r.date, { weekday: 'long', month: 'short', day: 'numeric' });
    this.busyId.set(r.id);
    let impact = this.impacts().get(r.id);
    if (!impact) {
      impact = await new Promise<DayOffImpact | undefined>((resolve) =>
        this.api.dayOffImpact(r.id).subscribe({ next: resolve, error: () => resolve(undefined) }),
      );
    }
    this.busyId.set(null);
    const card = impact ? approvalCard(impact) : null;
    const ok = await this.confirm.ask({
      title: `Approve ${r.employeeName.split(' ')[0]}'s ${r.emergency ? 'emergency ' : ''}day off?`,
      message: impact ? impact.summary : `${r.employeeName} asked for ${when} off.`,
      icon: impact?.level === 'SHORT' ? 'bi-exclamation-triangle' : 'bi-calendar-check',
      tone: card?.tone ?? 'primary',
      notes: card?.notes,
      confirmText: card?.confirmText ?? 'Approve',
    });
    if (!ok) {
      return;
    }
    this.busyId.set(r.id);
    this.api.approveDayOff(r.id).subscribe({
      next: (saved) => {
        this.busyId.set(null);
        this.toast.success(`Approved ${r.employeeName} — ${formatDay(r.date, { weekday: 'short', month: 'short', day: 'numeric' })}.`);
        if (saved.scheduleUpdate) {
          this.toast.info(saved.scheduleUpdate);
        }
        this.load();
      },
      error: () => this.busyId.set(null),
    });
  }

  protected async reject(r: DayOffRequest): Promise<void> {
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
    this.busyId.set(r.id);
    this.api.rejectDayOff(r.id, note || undefined).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.info(`Rejected ${r.employeeName}'s request.`);
        this.load();
      },
      error: () => this.busyId.set(null),
    });
  }

  protected async cancel(r: DayOffRequest): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Withdraw request?',
      message: `${r.employeeName}'s request for ${formatDay(r.date, { weekday: 'long', month: 'short', day: 'numeric' })} will be removed.`,
      icon: 'bi-trash',
      tone: 'danger',
      confirmText: 'Withdraw',
    });
    if (!ok) {
      return;
    }
    this.api.cancelDayOff(r.id).subscribe(() => {
      this.toast.info('Request withdrawn.');
      this.load();
    });
  }

  protected weekOf(date: string): string {
    return weekStartOf(date);
  }

  // ---------- New request modal ----------

  /** Approve/reject is for managers and admins, never on one's own request. */
  protected canReview(r: DayOffRequest): boolean {
    return this.auth.canManage() && r.employeeId !== this.auth.user()?.id;
  }

  protected canWithdraw(r: DayOffRequest): boolean {
    return r.status === 'PENDING' && (this.auth.canManage() || r.employeeId === this.auth.user()?.id);
  }

  protected openCreate(): void {
    const me = this.auth.user();
    // Employees request for themselves; managers for anyone in their own area.
    this.formArea.set(this.auth.isAdmin() ? this.areaFilter : (me?.areaId ?? null));
    this.formEmployeeId.set(this.auth.isEmployee() ? (me?.id ?? null) : null);
    this.formWeek.set(addDays(weekStartOf(today()), 7));
    this.formDays.set(new Set());
    this.formReason = '';
    this.formEmergency.set(false);
    this.formSearch.set('');
    this.loadFormEmployees();
    this.loadTaken();
    this.modalOpen.set(true);
  }

  protected onFormEmployeeChange(id: number | null): void {
    this.formEmployeeId.set(id);
    this.loadTaken();
  }

  protected setEmergency(on: boolean): void {
    this.formEmergency.set(on);
    if (!on) {
      // Back to a normal request: drop taken days and anything over the weekly limit.
      const taken = this.formTaken();
      const kept = [...this.formDays()].filter((d) => !taken.has(d)).sort().slice(0, this.maxDaysPerWeek);
      this.formDays.set(new Set(kept));
    }
  }

  /** Label for a day a normal request can't use: "Taken · Ana" (same store) or "Full" (area). */
  protected takenBy(date: string): string | null {
    const t = this.formTaken().get(date);
    if (!t) return null;
    return t.full ? 'Full' : `Taken · ${t.takenBy}`;
  }

  protected takenTitle(date: string): string | null {
    const t = this.formTaken().get(date);
    if (!t) return null;
    return t.full
      ? 'Enough people are already off this day; the stores need everyone else'
      : `${t.takenBy} at your store already has this day`;
  }

  protected dayDisabled(date: string): boolean {
    if (this.formDays().has(date)) {
      return false;
    }
    if (date < this.todayIso || this.formDays().size >= this.formMaxDays()) {
      return true;
    }
    return !this.formEmergency() && this.takenBy(date) !== null;
  }

  private loadTaken(): void {
    const employeeId = this.formEmployeeId();
    this.formTaken.set(new Map());
    if (!employeeId) {
      return;
    }
    const from = this.formWeek();
    this.api.takenDays(employeeId, from, addDays(from, 6)).subscribe({
      next: (days) => this.formTaken.set(new Map(days.map((d) => [d.date, d]))),
      error: () => undefined,
    });
  }

  protected onFormAreaChange(areaId: number | null): void {
    this.formArea.set(areaId);
    this.formEmployeeId.set(null);
    this.loadFormEmployees();
  }

  protected shiftFormWeek(weeks: number): void {
    this.formWeek.update((w) => addDays(w, weeks * 7));
    this.formDays.set(new Set());
    this.loadTaken();
  }

  protected toggleDay(date: string): void {
    this.formDays.update((set) => {
      const next = new Set(set);
      if (next.has(date)) {
        next.delete(date);
      } else if (next.size < this.formMaxDays()) {
        next.add(date);
      }
      return next;
    });
  }

  protected submit(): void {
    const employeeId = this.formEmployeeId();
    const dates = [...this.formDays()].sort();
    if (!employeeId || dates.length === 0) {
      return;
    }
    this.saving.set(true);
    const emergency = this.formEmergency();
    this.api.createDayOff({ employeeId, dates, reason: this.formReason.trim() || null, emergency }).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(
          `${emergency ? 'Emergency request sent' : created.length + ' day' + (created.length > 1 ? 's' : '') + ' requested'}` +
            ` for ${created[0].employeeName}.`,
        );
        this.status.set('PENDING');
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  private loadFormEmployees(): void {
    const areaId = this.formArea();
    if (this.auth.isEmployee()) {
      return;
    }
    if (areaId == null) {
      this.formEmployees.set([]);
      return;
    }
    this.api.employees({ areaId, active: true }).subscribe((list) =>
      this.formEmployees.set(list.filter((e) => e.role !== 'ADMIN')),
    );
  }
}
