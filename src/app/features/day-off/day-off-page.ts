import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LiveService } from '../../core/live.service';
import { addDays, formatDay, formatWeekRange, today, weekDates, weekStartOf } from '../../core/date-utils';
import { Area, DayOffImpact, DayOffRequest, DayOffStatus, Employee, TakenDay, RequestWindow, PortalMode } from '../../core/models';
import { IMPACT_BADGE, approvalCard } from '../../core/day-off-impact';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';
import { Pagination } from '../../shared/pagination';
import { RULES, clean } from '../../core/validation';
import { matchesSearch, savePageSize, savedPageSize } from '../../core/paging';

/** For managers PENDING means the emergency requests waiting for them. */
type StatusTab = DayOffStatus | 'ALL';

/** 'TUESDAY' for '2026-11-17'. */
function weekdayOf(date: string): string {
  return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date(date + 'T00:00:00').getDay()];
}

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
  protected readonly live = inject(LiveService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly maxDaysPerWeek = 2;
  /**
   * Managers: only emergencies, waiting and past (everything else the system checks and gives when the stores stay
   * covered, so it isn't listed). Employees: their days off, what's waiting, what wasn't given.
   */
  protected readonly tabs: { value: StatusTab; label: string; hint: string }[] = this.auth.canManage()
    ? [
        { value: 'PENDING', label: 'Emergency requests', hint: 'Emergency requests waiting for a manager or admin' },
        { value: 'ALL', label: 'History', hint: 'Emergency requests already decided, and the ones waiting' },
      ]
    : [
        { value: 'ALL', label: 'My days off', hint: 'Every day off you have or asked for' },
        { value: 'PENDING', label: 'Waiting', hint: 'Emergency requests waiting for your manager' },
        { value: 'REJECTED', label: 'Not given', hint: 'Requests turned down' },
      ];
  /** How many emergency requests wait (managers), for the tab badge. */
  protected readonly tabCounts = signal<Partial<Record<StatusTab, number>>>({});

  protected readonly areas = signal<Area[]>([]);
  protected readonly requests = signal<DayOffRequest[]>([]);
  protected readonly loading = signal(true);
  protected readonly busyId = signal<number | null>(null);
  /** Staffing check for each pending request the user can review, by request id. */
  protected readonly impacts = signal<Map<number, DayOffImpact>>(new Map());
  protected readonly impactBadge = IMPACT_BADGE;

  protected readonly status = signal<StatusTab>(this.auth.canManage() ? 'PENDING' : 'ALL');
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

  /** Message when the reason has characters the server won't accept. */
  protected reasonError(): string {
    return RULES.safeText.re.test(this.formReason) ? '' : `Reason: ${RULES.safeText.msg}`;
  }
  /** Urgent request: lifts the one-per-store and weekly limits (still needs approval). */
  protected readonly formEmergency = signal(false);
  /** The weekly request window (people asking for themselves pick from the open week only). */
  protected readonly window = signal<RequestWindow | null>(null);
  /** Asking for yourself (admins and managers entering it for someone else can make exceptions). */
  protected readonly selfService = computed(
    () => !this.auth.isAdmin() && this.formEmployeeId() != null && this.formEmployeeId() === this.auth.user()?.id,
  );
  /** Their days reserved by the system in the open weeks (self-service form). */
  protected readonly myReserved = signal<DayOffRequest[]>([]);
  /** Admins: the portal switch. */
  protected readonly portal = signal<RequestWindow | null>(null);
  protected readonly portalBusy = signal(false);

  /** The week window applies to this request. */
  protected readonly windowApplies = computed(
    () => this.selfService() && !!this.window()?.enabled && !this.formEmergency(),
  );
  /** Days in the chosen week a colleague at the same store already has off, by date → first name. */
  protected readonly formTaken = signal<Map<string, TakenDay>>(new Map());
  protected readonly formMaxDays = computed(() => (this.formEmergency() || this.formOverride() ? 7 : this.maxDaysPerWeek));
  /** Managers and admins, for someone else: give the day(s) off now, approved, skipping the usual checks. */
  protected readonly formOverride = signal(false);
  protected readonly canOverride = computed(
    () => !this.auth.isEmployee() && this.formEmployeeId() != null && this.formEmployeeId() !== this.auth.user()?.id,
  );

  protected readonly formWeekDates = computed(() => weekDates(this.formWeek()));
  protected readonly formWeekLabel = computed(() => formatWeekRange(this.formWeek()));
  protected readonly todayIso = today();

  protected readonly format = formatDay;

  ngOnInit(): void {
    // Their regular days off and usual days off come with their profile; a manager may have changed them.
    this.auth.refresh().subscribe({ error: () => undefined });
    this.api.areas().subscribe((list) => this.areas.set(list));
    this.api.dayOffWindow().subscribe({ next: (w) => this.portal.set(w), error: () => this.portal.set(null) });
    this.load();
    // Requests decided or sent from another device show up here without a manual refresh. The open form is left
    // alone; the list reloads when it's saved anyway.
    this.live.on(['dayoff', 'schedule', 'people'], this.destroyRef, (change) => {
      if (change.topic === 'people' || change.topic === 'resync') {
        this.auth.refresh().subscribe({ error: () => undefined });
      }
      if (this.modalOpen()) return;
      this.api.dayOffWindow().subscribe({ next: (w) => this.portal.set(w), error: () => undefined });
      this.load();
    });
  }

  /** Admins: opens or closes day-off requests (or back to the Friday cycle). */
  protected setPortal(mode: PortalMode): void {
    this.portalBusy.set(true);
    this.api.setRequestPortal(mode).subscribe({
      next: (w) => {
        this.portal.set(w);
        this.portalBusy.set(false);
        this.toast.success(mode === 'CLOSED' ? 'Day-off requests are closed.' : 'Day-off requests are open.');
        this.load();
      },
      error: () => this.portalBusy.set(false),
    });
  }

  protected readonly addDays = addDays;

  /**
   * Their regular days off in the week being picked: from their profile (the same weekday every week), or the
   * regular days already held for them that week.
   */
  protected readonly myRegularDates = computed(() => {
    if (!this.selfService()) return [];
    const weekdays = new Set(this.auth.user()?.regularDaysOff ?? []);
    const held = new Set(this.myReserved().filter((r) => r.regular).map((r) => r.date));
    return this.formWeekDates().filter((d) => weekdays.has(weekdayOf(d)) || held.has(d));
  });

  protected isMyRegular(date: string): boolean {
    return this.myRegularDates().includes(date);
  }

  /** How many days off they normally have a week. */
  protected readonly usualDaysOff = computed(() => 7 - (this.auth.user()?.workDaysPerWeek ?? 6));

  /**
   * Regular days that become work days if they send the days picked now: a day they choose replaces their regular
   * day that week once they'd have more than their usual days off. Emergencies come on top, so they replace nothing.
   */
  protected readonly regularReplaced = computed(() => {
    const regular = this.myRegularDates();
    if (this.formEmergency() || regular.length === 0) return [];
    const picked = [...this.formDays()].filter((d) => !regular.includes(d)).length;
    const keptRegular = regular.filter((d) => !this.formDays().has(d));
    const extra = picked + regular.length - this.usualDaysOff();
    return extra > 0 ? keptRegular.slice(-extra) : [];
  });

  /** A day the system reserved for them (picking it just keeps it). */
  protected isMyReserved(date: string): boolean {
    return this.selfService() && this.myReserved().some((r) => r.date === date);
  }

  /** "Nov 16" style. */
  protected short(d: string): string {
    return formatDay(d, { month: 'short', day: 'numeric' });
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
    document.querySelector('.do-head')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
    this.loadCounts();
    const status = this.status();
    this.api
      .dayOffRequestsPage({
        areaId: this.areaFilter,
        status: status === 'ALL' ? null : status,
        from: this.fromFilter || null,
        to: this.toFilter || null,
        q: this.search.trim() || null,
        // Asked: not reserved. Regular: regular days off. Reserved: picked by the system (not regular ones).
        // Managers only see emergencies: everything else the system checked and gave (it's on the schedule).
        reserved: null,
        regular: null,
        emergency: this.auth.canManage() ? true : null,
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

  /** Badge count for the managers' Emergency requests tab. */
  private loadCounts(): void {
    if (!this.auth.canManage()) return;
    const base = { areaId: this.areaFilter, status: 'PENDING' as DayOffStatus, from: this.fromFilter || null, to: null, q: null,
      page: 0, size: 1 };
    this.api.dayOffRequestsPage({ ...base, emergency: true }).subscribe({
      next: (r) => this.tabCounts.update((c) => ({ ...c, PENDING: r.totalElements })), error: () => undefined,
    });
  }

  /** Checks staffing for every request waiting for a decision, so problems show before deciding. */
  private loadImpacts(list: DayOffRequest[]): void {
    this.impacts.set(new Map());
    for (const r of list) {
      // Planned days (regular, reserved) aren't decided by anyone: the system gives them at generate.
      if (r.status === 'PENDING' && !r.reserved && this.canReview(r)) {
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

  /** Approved → rejected (the day becomes a work day again) or rejected → approved, with a required reason. */
  protected async changeDecision(r: DayOffRequest): Promise<void> {
    const revoke = r.status === 'APPROVED';
    const when = formatDay(r.date, { weekday: 'long', month: 'short', day: 'numeric' });
    const first = r.employeeName.split(' ')[0];
    const reason = await this.confirm.askWithInput({
      title: revoke ? `Revoke ${first}'s day off?` : `Approve ${first}'s day off after all?`,
      message: revoke
        ? `${r.employeeName}'s approved day off on ${when} will be changed to rejected, and they'll be scheduled to work that day.`
        : `${r.employeeName}'s rejected request for ${when} will be changed to approved, and they'll be taken off that day.`,
      icon: revoke ? 'bi-arrow-counterclockwise' : 'bi-calendar-check',
      tone: revoke ? 'warning' : 'primary',
      notes: ['The employee is notified with your reason.'],
      input: { label: 'Reason (required, shown to the employee)', placeholder: revoke ? 'e.g. Inventory day, all hands needed' : 'e.g. Coverage found', required: true },
      confirmText: revoke ? 'Change to rejected' : 'Change to approved',
    });
    if (!reason) {
      return;
    }
    const reasonOk = RULES.safeText.re.test(reason);
    if (!reasonOk) {
      this.toast.error(`Reason: ${RULES.safeText.msg}`);
      return;
    }
    this.busyId.set(r.id);
    this.api.changeDayOffDecision(r.id, revoke ? 'REJECTED' : 'APPROVED', reason).subscribe({
      next: (saved) => {
        this.busyId.set(null);
        this.toast.success(`${r.employeeName}'s day off on ${formatDay(r.date, { weekday: 'short', month: 'short', day: 'numeric' })} is now ${revoke ? 'rejected' : 'approved'}.`);
        if (saved.scheduleUpdate) {
          this.toast.info(saved.scheduleUpdate);
        }
        this.load();
      },
      error: () => this.busyId.set(null),
    });
  }

  /** A decided request can be changed by a manager/admin until the day has passed. */
  protected canChangeDecision(r: DayOffRequest): boolean {
    return r.status !== 'PENDING' && r.date >= this.todayIso
      && this.auth.canManage() && (this.auth.isAdmin() || r.employeeId !== this.auth.user()?.id);
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
    // Planned days (regular, reserved) aren't requests anyone sent: they change when someone picks another day.
    if (r.reserved) return false;
    return r.status === 'PENDING' && (this.auth.canManage() || r.employeeId === this.auth.user()?.id);
  }

  protected openCreate(): void {
    const me = this.auth.user();
    // Employees request for themselves; managers for anyone in their own area.
    this.formArea.set(this.auth.isAdmin() ? this.areaFilter : (me?.areaId ?? null));
    this.formEmployeeId.set(this.auth.isEmployee() ? (me?.id ?? null) : null);
    this.formWeek.set(addDays(weekStartOf(today()), 7));
    this.api.dayOffWindow().subscribe({
      next: (w) => {
        this.window.set(w);
        // Start on the week they can ask for.
        if (w.enabled && this.formDays().size === 0 && w.openWeeks.length) {
          this.formWeek.set(w.openWeeks[0]);
          this.loadTaken();
        }
        // Show the days reserved for them, so they know what asking for another day will swap.
        if (w.reservations && w.openWeeks.length && !this.auth.isAdmin()) {
          const from = w.openWeeks[0];
          const to = addDays(w.openWeeks[w.openWeeks.length - 1], 6);
          this.api
            .dayOffRequests({ employeeId: this.auth.user()?.id ?? null, from, to })
            .subscribe({
              next: (list) => this.myReserved.set(list.filter((r) => r.reserved && r.status !== 'REJECTED')),
              error: () => undefined,
            });
        }
      },
      error: () => this.window.set(null),
    });
    this.formDays.set(new Set());
    this.formReason = '';
    this.formEmergency.set(false);
    this.formOverride.set(false);
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
    if (this.windowApplies() && !this.window()!.openWeeks.includes(weekStartOf(date))) {
      return true;
    }
    return !this.formEmergency() && !(this.formOverride() && this.canOverride()) && this.takenBy(date) !== null;
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
    const override = this.formOverride() && this.canOverride();
    this.api.createDayOff({ employeeId, dates, reason: clean(this.formReason), emergency, override }).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.modalOpen.set(false);
        const days = created.length + ' day' + (created.length > 1 ? 's' : '');
        const when = created.map((c) => formatDay(c.date, { weekday: 'short', month: 'short', day: 'numeric' })).join(' and ');
        const mine = created[0].employeeId === this.auth.user()?.id;
        const first = created[0].employeeName.split(' ')[0];
        this.toast.success(
          override
            ? `${days} off given to ${created[0].employeeName}. They've been told.`
            : emergency
              ? `Emergency request sent for ${when}. A manager will decide.`
              : `${mine ? "You're" : first + ' is'} off on ${when}.`,
        );
        // Normal requests are given straight away; only emergencies wait.
        this.status.set(emergency && !override ? 'PENDING' : 'APPROVED');
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
