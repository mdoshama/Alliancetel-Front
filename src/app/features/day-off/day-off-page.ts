import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LiveService } from '../../core/live.service';
import { weekDayOffLabel } from '../../core/week-days-off';
import { addDays, formatDay, formatWeekRange, today, weekDates, weekStartOf } from '../../core/date-utils';
import { Area, DayOffImpact, DayOffRequest, DayOffStatus, Employee, TakenDay, RequestWindow, PortalMode, ExtraDaysOff } from '../../core/models';
import { IMPACT_BADGE, approvalCard } from '../../core/day-off-impact';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';
import { Pagination } from '../../shared/pagination';
import { RULES, clean } from '../../core/validation';
import { matchesSearch, savePageSize, savedPageSize } from '../../core/paging';

/** Weeks after the current one that people asking for themselves can reach (the server checks the same). */
const SELF_SERVICE_WEEKS_AHEAD = 2;

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

  /** The most a normal request can ever get in a week (the server's weekly maximum). */
  private readonly weeklyCap = 2;
  /**
   * Managers: only emergencies, waiting and past (everything else the system checks and gives when the stores stay
   * covered, so it isn't listed). Employees: their days off, what's waiting, what wasn't given.
   */
  protected readonly tabs: { value: StatusTab; label: string; hint: string; short?: string }[] = this.auth.canManage()
    ? [
        { value: 'PENDING', label: 'Pending', hint: 'Emergency requests waiting for a manager or admin' },
        { value: 'APPROVED', label: 'Approved', hint: 'Emergency requests that were approved' },
        { value: 'REJECTED', label: 'Rejected', hint: 'Emergency requests that were turned down' },
        { value: 'ALL', label: 'All requested', short: 'All', hint: 'Every emergency request: waiting, approved and rejected' },
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
  /** The chosen person's own requests in the week being picked (any status). */
  protected readonly formMine = signal<DayOffRequest[]>([]);
  /** Taken days and their own requests for the week have loaded. */
  protected readonly formWeekLoaded = signal(false);

  /** People asking for themselves can't go back before this week, nor more than two weeks ahead. */
  /**
   * The first week anyone can pick, admins and managers included: this week's schedule is already made (changes to
   * it are made on the schedule itself), so requests start at next week.
   */
  protected readonly firstWeek = computed(() => addDays(weekStartOf(today()), 7));
  /** The last week they can reach: two weeks ahead, or further when their manager opened requests until a date. */
  protected readonly lastWeek = computed(() => {
    const usual = addDays(weekStartOf(today()), 7 * SELF_SERVICE_WEEKS_AHEAD);
    // Asking for yourself: your area's window. For someone else: their area's (opened further ahead or not).
    const last = this.selfService()
      ? this.window()?.lastDate
      : this.areas().find((a) => a.id === this.formArea())?.requestsOpenUntil;
    return last && weekStartOf(last) > usual ? weekStartOf(last) : usual;
  });
  protected readonly canPrevWeek = computed(() => this.formWeek() > this.firstWeek());
  protected readonly canNextWeek = computed(() => this.formWeek() < this.lastWeek());

  /**
   * A day they can ask for now (asking for themselves): in a week taking requests, or from next week on up to the
   * date their manager opened requests until.
   */
  protected isOpenDay(date: string): boolean {
    const w = this.window();
    if (!w) return true;
    if (w.openWeeks.includes(weekStartOf(date))) return true;
    return !!w.openUntil && date <= w.openUntil && weekStartOf(date) >= addDays(weekStartOf(today()), 7);
  }

  /** Their own request on this day, if any. */
  protected myRequestOn(date: string): DayOffRequest | undefined {
    return this.formMine().find((r) => r.date === date);
  }

  /**
   * No day left in the week that a normal request could get: closed for requests, the weekly limit used, or every
   * remaining day taken, full or already theirs. Only then can someone asking for themselves send an emergency.
   */
  protected readonly weekFull = computed(() => {
    if (!this.formWeekLoaded()) return false;
    const w = this.window();
    const mine = this.formMine();
    const normal = mine.filter((r) => !r.emergency && !r.reserved && r.status !== 'REJECTED').length;
    if (normal >= this.maxDaysPerWeek()) return true;
    return !this.formWeekDates().some(
      (d) => d >= this.todayIso && (!w?.enabled || this.isOpenDay(d)) && !this.takenBy(d)
        && !mine.some((r) => r.date === d && r.status !== 'REJECTED'),
    );
  });

  /** The emergency switch: always for managers entering it for someone else; for oneself only when the week is full. */
  protected readonly emergencyAvailable = computed(() => !this.selfService() || this.weekFull());
  protected readonly formMaxDays = computed(() =>
    this.formEmergency() || (this.formOverride() && this.canOverride()) ? 7 : this.normalLeft(),
  );

  /** Extra days picked past the weekly limit, sent as an emergency request (after the normal days). */
  protected readonly formEmergencyDays = signal<Set<string>>(new Set());

  /** Normal days off they already have this week (asked for, not reserved or emergency). */
  protected readonly existingNormal = computed(
    () => this.formMine().filter((r) => !r.emergency && !r.reserved && r.status !== 'REJECTED').length,
  );

  /** Normal days still left to pick this week. */
  protected readonly normalLeft = computed(() => Math.max(0, this.maxDaysPerWeek() - this.existingNormal()));

  /** Any part of this request is an emergency: the form turns red. */
  protected readonly emergencyMode = computed(() => this.formEmergency() || this.formEmergencyDays().size > 0);

  /**
   * Days picked that count toward the weekly limit. Their regular day off doesn't: it's already theirs, and picking
   * another day swaps it (the regular day becomes a work day that week).
   */
  protected readonly normalPicks = computed(() => [...this.formDays()].filter((d) => !this.isMyRegular(d)).length);

  /** The weekly limit is used up: picking another day asks whether to send it as an emergency request. */
  protected readonly overflowsToEmergency = computed(
    () => !this.formEmergency() && !(this.formOverride() && this.canOverride()) && this.normalPicks() >= this.formMaxDays(),
  );

  /**
   * Days off a normal request can get in one week: their usual days off (1 for a 6-day worker, 2 for a 5-day
   * worker). More than that needs an emergency request. The server checks the same.
   */
  protected readonly maxDaysPerWeek = computed(() => {
    const id = this.formEmployeeId();
    const me = this.auth.user();
    const workDays = id != null && id === me?.id
      ? me?.workDaysPerWeek
      : this.formEmployees().find((e) => e.id === id)?.workDaysPerWeek;
    return Math.max(1, Math.min(this.weeklyCap, 7 - (workDays ?? 6)));
  });
  /** Managers and admins, for someone else: give the day(s) off now, approved, skipping the usual checks. */
  protected readonly formOverride = signal(false);
  protected readonly canOverride = computed(
    () => !this.auth.isEmployee() && this.formEmployeeId() != null && this.formEmployeeId() !== this.auth.user()?.id,
  );

  protected readonly formWeekDates = computed(() => weekDates(this.formWeek()));
  protected readonly formWeekLabel = computed(() => formatWeekRange(this.formWeek()));
  protected readonly todayIso = today();

  protected readonly format = formatDay;
  protected readonly weekDayOffLabel = weekDayOffLabel;

  ngOnInit(): void {
    // Their regular days off and usual days off come with their profile; a manager may have changed them.
    this.auth.refresh().subscribe({ error: () => undefined });
    this.api.areas().subscribe((list) => this.areas.set(list));
    this.api.dayOffWindow().subscribe({ next: (w) => this.portal.set(w), error: () => this.portal.set(null) });
    this.load();
    this.loadExtraDays();
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

  // ---------- Open requests further ahead (managers: their area; admins: any area) ----------

  /** The area whose request window is shown: the manager's own, or the one an admin picked. */
  protected readonly owAreaId = signal<number | null>(null);
  protected readonly owArea = computed(() => {
    const id = this.auth.isAdmin() ? (this.owAreaId() ?? this.areas().find((a) => a.active)?.id ?? null) : this.auth.areaId();
    return this.areas().find((a) => a.id === id) ?? null;
  });
  protected readonly owEditing = signal(false);
  protected owDate = '';
  protected readonly owBusy = signal(false);
  /** Quick picks for how far ahead to open requests. */
  protected readonly owChoices = computed(() => {
    const t = today();
    const endOfNextMonth = (() => {
      const d = new Date(t + 'T00:00:00');
      const end = new Date(d.getFullYear(), d.getMonth() + 2, 0);
      return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    })();
    return [
      { label: '3 weeks', date: addDays(weekStartOf(t), 7 * 4 - 1) },
      { label: '6 weeks', date: addDays(weekStartOf(t), 7 * 7 - 1) },
      { label: 'End of next month', date: endOfNextMonth },
    ];
  });
  protected readonly maxOpenDate = addDays(today(), 365);
  protected readonly minOpenDate = addDays(today(), 1);

  protected startOpenUntil(): void {
    this.owDate = this.owArea()?.requestsOpenUntil ?? this.owChoices()[0].date;
    this.owEditing.set(true);
  }

  protected saveOpenUntil(until: string | null): void {
    const area = this.owArea();
    if (!area) return;
    this.owBusy.set(true);
    this.api.setOpenUntil(area.id, until).subscribe({
      next: (res) => {
        this.owBusy.set(false);
        this.owEditing.set(false);
        this.areas.update((list) =>
          list.map((a) => (a.id === area.id ? { ...a, requestsOpenUntil: res.until, requestsOpenedBy: res.by } : a)),
        );
        this.toast.success(
          until
            ? `${area.name}: employees can ask for days off until ${formatDay(until, { weekday: 'short', month: 'short', day: 'numeric' })}.`
            : `${area.name} is back to the usual window (next week).`,
        );
        this.api.dayOffWindow().subscribe({ next: (w) => this.portal.set(w), error: () => undefined });
      },
      error: () => this.owBusy.set(false),
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
    // Their regular weekday, and any day held for them that week (regular, or picked by the system): picking
    // another day swaps it, they work that day instead.
    const held = new Set([
      ...this.myReserved().filter((r) => r.regular).map((r) => r.date),
      ...this.formMine().filter((r) => r.reserved && !r.emergency && r.status !== 'REJECTED').map((r) => r.date),
    ]);
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

  /** Badge counts for the managers' emergency tabs (pending, approved, rejected, all requested). */
  private loadCounts(): void {
    if (!this.auth.canManage()) return;
    const base = { areaId: this.areaFilter, from: this.fromFilter || null, to: this.toFilter || null,
      q: this.search.trim() || null, emergency: true, page: 0, size: 1 };
    for (const tab of this.tabs) {
      this.api.dayOffRequestsPage({ ...base, status: tab.value === 'ALL' ? null : tab.value }).subscribe({
        next: (r) => this.tabCounts.update((c) => ({ ...c, [tab.value]: r.totalElements })), error: () => undefined,
      });
    }
  }

  /** Checks staffing for every request waiting for a decision, so problems show before deciding. */
  /** Requests whose store check is still on its way (only these show "Checking the stores…"). */
  protected readonly impactsLoading = signal<Set<number>>(new Set());

  private loadImpacts(list: DayOffRequest[]): void {
    this.impacts.set(new Map());
    const ids = new Set<number>();
    for (const r of list) {
      // Planned days (regular, reserved) aren't decided by anyone: the system gives them at generate.
      if (r.status === 'PENDING' && !r.reserved && this.canReview(r)) ids.add(r.id);
    }
    this.impactsLoading.set(new Set(ids));
    const done = (id: number) => this.impactsLoading.update((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    for (const id of ids) {
      this.api.dayOffImpact(id).subscribe({
        next: (impact) => {
          this.impacts.update((m) => new Map(m).set(id, impact));
          done(id);
        },
        // No check (e.g. the network hiccuped): the manager can still decide, just without the hint.
        error: () => done(id),
      });
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
      && this.auth.canManage();
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

  // ---------- Managers and admins: each person's requests together ----------

  /** The page's requests grouped by person (the server sends them A to Z, each person's days together). */
  protected readonly personGroups = computed(() => {
    const groups: { employeeId: number; name: string; code: string; areaName: string | null; items: DayOffRequest[] }[] = [];
    for (const r of this.requests()) {
      const last = groups[groups.length - 1];
      if (last && last.employeeId === r.employeeId) last.items.push(r);
      else groups.push({ employeeId: r.employeeId, name: r.employeeName, code: r.employeeCode, areaName: r.areaName, items: [r] });
    }
    // Next to an emergency: their other days off that week, each one a row, so a manager can keep or approve one
    // day or all of them.
    for (const g of groups) {
      const shown = new Set(g.items.map((r) => r.id));
      const extra: DayOffRequest[] = [];
      for (const r of g.items) {
        for (const w of r.emergency ? (r.weekDaysOff ?? []) : []) {
          if (shown.has(w.id)) continue;
          shown.add(w.id);
          extra.push({
            ...r,
            id: w.id,
            date: w.date,
            dayOfWeek: '',
            status: w.status,
            emergency: w.kind === 'EMERGENCY',
            reserved: w.kind === 'REGULAR' || w.kind === 'SYSTEM',
            regular: w.kind === 'REGULAR',
            reason: null,
            reviewNote: null,
            previousStatus: null,
            decisionChangeReason: null,
            weekDaysOff: null,
            reviewedBy: w.reviewedBy ?? null,
            reviewedAt: w.reviewedAt ?? null,
            createdAt: w.createdAt ?? '',
            companion: w.kind,
          });
        }
      }
      if (extra.length) g.items = [...g.items, ...extra].sort((a, b) => a.date.localeCompare(b.date));
    }
    return groups;
  });

  /** "Thu, Nov 12, 3:04 PM" */
  protected stamp(iso: string | null | undefined): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  /** "Approved by the system" / "Rejected by Maria Garcia" / null while waiting. */
  protected decidedBy(r: DayOffRequest): string | null {
    if (r.status === 'PENDING' || !r.reviewedBy) return null;
    const what = r.status === 'APPROVED' ? 'Approved' : 'Rejected';
    return r.reviewedBy === 'System' ? `${what} by the system` : `${what} by ${r.reviewedBy}`;
  }

  /** A day shown next to an emergency: why they have it. */
  protected companionLabel(kind: DayOffRequest['companion']): string {
    switch (kind) {
      case 'REGULAR': return 'Regular day off';
      case 'SYSTEM': return 'Given by the system';
      case 'ASKED': return 'Asked for';
      case 'EMERGENCY': return 'Emergency';
      default: return '';
    }
  }

  /** On a card with an emergency: how many days off they'd have that week if everything is approved. */
  protected weekSummary(items: DayOffRequest[]): string | null {
    const weeks = [...new Set(items.filter((r) => r.emergency && !r.companion && r.status === 'PENDING')
      .map((r) => weekStartOf(r.date)))].sort();
    const parts = weeks.map((monday) => {
      const sunday = addDays(monday, 6);
      const n = items.filter((r) => r.date >= monday && r.date <= sunday && r.status !== 'REJECTED').length;
      return n >= 2 ? `week of ${this.short(monday)}: ${n} days off` : null;
    }).filter((x): x is string => !!x);
    if (!parts.length) return null;
    const text = parts.join(', ');
    return `If you approve all, ${text}. Approve or remove each day to give fewer.`;
  }

  protected canRemoveCompanion(r: DayOffRequest): boolean {
    return r.date >= this.todayIso && this.auth.canManage();
  }

  /** Takes a day shown next to an emergency back: they work that day (e.g. the manager approves the emergency only). */
  protected async removeCompanion(r: DayOffRequest): Promise<void> {
    if (r.status === 'APPROVED') {
      await this.changeDecision(r);
      return;
    }
    await this.reject(r);
  }

  /** Admins: people with more days off in a week than they normally get. */
  protected readonly extraDays = signal<ExtraDaysOff[]>([]);
  protected readonly extraOpen = signal(false);
  protected readonly extraBusy = signal(false);
  protected readonly extraCount = computed(() => this.extraDays().reduce((n, x) => n + x.extra.length, 0));

  private loadExtraDays(): void {
    if (!this.auth.isAdmin()) return;
    this.api.extraDaysOff().subscribe({ next: (list) => this.extraDays.set(list), error: () => this.extraDays.set([]) });
  }

  protected async moveExtraDays(): Promise<void> {
    const n = this.extraCount();
    const ok = await this.confirm.ask({
      title: `Move ${n} extra day${n === 1 ? '' : 's'} off to emergency requests?`,
      message: `${this.extraDays().length} ${this.extraDays().length === 1 ? 'person has' : 'people have'} more days off in a week than they normally get. ` +
        'The extra days become emergency requests for a manager to approve or reject.',
      icon: 'bi-exclamation-octagon',
      tone: 'warning',
      notes: [
        'Until a manager approves them, they are back on the schedule those days.',
        'A day the system only planned (nobody asked for it) is dropped: they work that day.',
        'Days a manager or admin gave directly are left alone.',
      ],
      confirmText: 'Move to emergency requests',
    });
    if (!ok) return;
    this.extraBusy.set(true);
    this.api.moveExtraDaysOff().subscribe({
      next: (res) => {
        this.extraBusy.set(false);
        this.toast.success(`Moved ${res.days} day${res.days === 1 ? '' : 's'} (${res.people} ${res.people === 1 ? 'person' : 'people'}) to emergency requests.`);
        this.extraDays.set([]);
        this.extraOpen.set(false);
        this.load();
      },
      error: () => this.extraBusy.set(false),
    });
  }

  /** A person's requests a manager can decide now. */
  protected decidable(items: DayOffRequest[]): DayOffRequest[] {
    return items.filter((r) => r.status === 'PENDING' && !r.reserved && this.canReview(r));
  }

  protected initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  }

  /** "Mon Nov 16, Tue Nov 17" */
  private dayList(items: DayOffRequest[]): string {
    return items.map((r) => formatDay(r.date, { weekday: 'short', month: 'short', day: 'numeric' })).join(', ');
  }

  /** Approves all of a person's waiting requests at once. */
  protected async approveAll(name: string, items: DayOffRequest[]): Promise<void> {
    const list = this.decidable(items);
    if (list.length === 0) return;
    const short = list.filter((r) => this.impacts().get(r.id)?.level === 'SHORT');
    const ok = await this.confirm.ask({
      title: `Approve ${name.split(' ')[0]}'s ${list.length} days off?`,
      message: this.dayList(list),
      icon: short.length ? 'bi-exclamation-triangle' : 'bi-calendar-check',
      tone: short.length ? 'danger' : 'primary',
      notes: short.length ? [`${short.length} of these leave a store short-staffed.`] : undefined,
      confirmText: `Approve ${list.length}`,
    });
    if (!ok) return;
    this.busyId.set(list[0].id);
    this.api.approveManyDaysOff(list.map((r) => r.id), false).subscribe({
      next: (res) => {
        this.busyId.set(null);
        if (res.approved.length) this.toast.success(`Approved ${res.approved.length} day${res.approved.length === 1 ? '' : 's'} for ${name}.`);
        for (const s of res.skipped) this.toast.info(`${formatDay(s.date, { weekday: 'short', month: 'short', day: 'numeric' })}: ${s.reason}`);
        this.load();
      },
      error: () => this.busyId.set(null),
    });
  }

  /** Rejects all of a person's waiting requests with one reason. */
  protected async rejectAll(name: string, items: DayOffRequest[]): Promise<void> {
    const list = this.decidable(items);
    if (list.length === 0) return;
    const note = await this.confirm.askWithInput({
      title: `Reject ${name.split(' ')[0]}'s ${list.length} days off?`,
      message: this.dayList(list),
      icon: 'bi-x-circle',
      tone: 'danger',
      input: { label: 'Reason (optional, shown to the employee)', placeholder: 'e.g. Short-staffed that week' },
      confirmText: `Reject ${list.length}`,
    });
    if (note === null) return;
    this.busyId.set(list[0].id);
    forkJoin(list.map((r) => this.api.rejectDayOff(r.id, note || undefined))).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.info(`Rejected ${list.length} day${list.length === 1 ? '' : 's'} for ${name}.`);
        this.load();
      },
      error: () => {
        this.busyId.set(null);
        this.load();
      },
    });
  }

  /** Approve/reject is for managers and admins, their own days off included (no admin needed). */
  protected canReview(_r: DayOffRequest): boolean {
    return this.auth.canManage();
  }

  protected canWithdraw(r: DayOffRequest): boolean {
    // Planned days (regular, reserved) aren't requests anyone sent: they change when someone picks another day.
    if (r.reserved) return false;
    return r.status === 'PENDING' && (this.auth.canManage() || r.employeeId === this.auth.user()?.id);
  }

  /**
   * A normal day off they (or, for a manager, someone on their team) can still change: not an emergency, not a day the
   * system planned, not passed, and in a week that's still open for changes.
   */
  protected canMove(r: DayOffRequest): boolean {
    if (r.emergency || r.reserved || r.companion || r.status === 'REJECTED') return false;
    if (r.date < this.todayIso || weekStartOf(r.date) < this.firstWeek()) return false;
    return r.employeeId === this.auth.user()?.id || (this.auth.canManage() && !this.auth.isEmployee());
  }

  /** Opens the request form on that week: tapping a day with room moves this day off there. */
  protected openChange(r: DayOffRequest): void {
    const mine = r.employeeId === this.auth.user()?.id;
    this.openCreate(mine && this.auth.isManager(), weekStartOf(r.date));
    if (!mine) {
      this.formArea.set(r.areaId ?? this.formArea());
      this.loadFormEmployees();
      this.formEmployeeId.set(r.employeeId);
      this.loadTaken();
    }
    const day = formatDay(r.date, { weekday: 'long', month: 'short', day: 'numeric' });
    this.toast.info(`Tap the day you'd like instead of ${day}. A day that still has room is given straight away.`);
  }

  /** Managers on the schedule can take days off for themselves too (they decide their own emergencies too). */
  protected readonly canAskForMe = computed(() => this.auth.isManager() && this.auth.user()?.worksShifts !== false);
  /** Managers: asking for themselves rather than for someone on the team. */
  protected readonly forMe = signal(false);

  protected setForMe(on: boolean): void {
    this.forMe.set(on);
    this.formEmployeeId.set(on ? (this.auth.user()?.id ?? null) : null);
    if (this.formWeek() < this.firstWeek()) this.formWeek.set(this.firstWeek());
    if (this.formWeek() > this.lastWeek()) this.formWeek.set(this.lastWeek());
    this.formDays.set(new Set());
    this.formEmergencyDays.set(new Set());
    this.formEmergency.set(false);
    this.formOverride.set(false);
    this.loadTaken();
  }

  protected openCreate(forMe = false, week?: string): void {
    const me = this.auth.user();
    // Employees request for themselves; managers for anyone in their own area, or for themselves.
    this.forMe.set(forMe && this.canAskForMe());
    this.formArea.set(this.auth.isAdmin() ? this.areaFilter : this.auth.areaId());
    this.formEmployeeId.set(this.auth.isEmployee() || this.forMe() ? (me?.id ?? null) : null);
    this.formWeek.set(week ?? addDays(weekStartOf(today()), 7));
    this.api.dayOffWindow().subscribe({
      next: (w) => {
        this.window.set(w);
        // Start on the week they can ask for (unless they're changing a day in a given week).
        if (!week && w.enabled && this.formDays().size === 0 && (w.openWeeks.length || w.openUntil)) {
          this.formWeek.set(w.openWeeks[0] ?? addDays(weekStartOf(today()), 7));
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
    this.formEmergencyDays.set(new Set());
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
    if (this.formWeek() < this.firstWeek()) this.formWeek.set(this.firstWeek());
    if (this.formWeek() > this.lastWeek()) this.formWeek.set(this.lastWeek());
    this.loadTaken();
  }

  protected setEmergency(on: boolean): void {
    this.formEmergency.set(on);
    if (on) {
      // The whole request is now an emergency: extra days join the picked ones.
      const extra = this.formEmergencyDays();
      this.formDays.update((set) => new Set([...set, ...extra]));
      this.formEmergencyDays.set(new Set());
    } else {
      // Back to a normal request: drop taken days and anything over the weekly limit.
      const taken = this.formTaken();
      const kept = [...this.formDays()].filter((d) => !taken.has(d)).sort().slice(0, this.maxDaysPerWeek());
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

  private fullReason(date: string, me: boolean): string {
    const t = this.formTaken().get(date);
    return !t || t.full
      ? `full (enough people are already off, so the stores need ${me ? 'you' : 'them'})`
      : `taken (${t.takenBy} at ${me ? 'your' : 'their'} store already has it)`;
  }

  protected dayDisabled(date: string): boolean {
    if (this.formDays().has(date) || this.formEmergencyDays().has(date)) {
      return false;
    }
    if (date < this.todayIso) {
      return true;
    }
    // A day they already asked for (a reserved or regular day can be picked: that just keeps it).
    const mine = this.myRequestOn(date);
    // A day turned down can be asked for again.
    if (mine && mine.status !== 'REJECTED' && !mine.reserved && !(this.formOverride() && this.canOverride())) {
      return true;
    }
    // A full or taken day can be clicked: it asks about an emergency request.
    if (this.takenBy(date) !== null && !(this.formOverride() && this.canOverride())) {
      return this.windowApplies() && !this.isOpenDay(date);
    }
    // Limit used up: any other day can still be clicked, and asks about an emergency request.
    if (this.overflowsToEmergency()) {
      return false;
    }
    if (this.normalPicks() >= this.formMaxDays()) {
      return true;
    }
    if (this.windowApplies() && !this.isOpenDay(date)) {
      return true;
    }
    return !this.formEmergency() && !(this.formOverride() && this.canOverride()) && this.takenBy(date) !== null;
  }

  private loadTaken(): void {
    const employeeId = this.formEmployeeId();
    this.formTaken.set(new Map());
    this.formMine.set([]);
    this.formWeekLoaded.set(false);
    if (!employeeId) {
      return;
    }
    const from = this.formWeek();
    const to = addDays(from, 6);
    forkJoin({
      taken: this.api.takenDays(employeeId, from, to).pipe(catchError(() => of([] as TakenDay[]))),
      mine: this.api.dayOffRequests({ employeeId, from, to }).pipe(catchError(() => of([] as DayOffRequest[]))),
    }).subscribe(({ taken, mine }) => {
      // The week may have changed while loading.
      if (this.formWeek() !== from || this.formEmployeeId() !== employeeId) return;
      this.formTaken.set(new Map(taken.map((d) => [d.date, d])));
      this.formMine.set(mine);
      this.formWeekLoaded.set(true);
      if (this.formEmergency() && !this.emergencyAvailable()) {
        this.setEmergency(false);
      }
    });
  }

  protected onFormAreaChange(areaId: number | null): void {
    this.formArea.set(areaId);
    this.formEmployeeId.set(null);
    this.loadFormEmployees();
  }

  protected shiftFormWeek(weeks: number): void {
    const next = addDays(this.formWeek(), weeks * 7);
    if (next < this.firstWeek() || next > this.lastWeek()) {
      return;
    }
    this.formWeek.set(next);
    this.formDays.set(new Set());
    this.formEmergencyDays.set(new Set());
    this.loadTaken();
  }

  protected async toggleDay(date: string): Promise<void> {
    if (this.formEmergencyDays().has(date)) {
      this.formEmergencyDays.update((set) => {
        const next = new Set(set);
        next.delete(date);
        return next;
      });
      return;
    }
    if (this.formDays().has(date)) {
      this.formDays.update((set) => {
        const next = new Set(set);
        next.delete(date);
        return next;
      });
      // With room for a normal day again, extra days can't go as an emergency (the week isn't full): pick again.
      if (this.formEmergencyDays().size && !this.overflowsToEmergency()) {
        this.formEmergencyDays.set(new Set());
        this.toast.info('Emergency days cleared: you have a normal day off to pick again.');
      }
      return;
    }
    if (this.takenBy(date) !== null && !(this.formOverride() && this.canOverride())) {
      await this.askEmergency(date, true);
      return;
    }
    if (this.overflowsToEmergency() && !this.isMyRegular(date)) {
      // The day has room: changing a day they already have needs no emergency request.
      if (await this.offerMove(date)) return;
      await this.askEmergency(date);
      return;
    }
    if (this.isMyRegular(date) || this.normalPicks() < this.formMaxDays()) {
      this.formDays.update((set) => {
        const next = new Set(set).add(date);
        // A different day swaps out their regular day: it isn't kept alongside the new one.
        if (!this.isMyRegular(date)) {
          for (const d of [...next]) if (this.isMyRegular(d)) next.delete(d);
        }
        return next;
      });
    }
  }

  /**
   * Their days off this week are used up but this day still has room: they changed their mind, so offer to move a day
   * they have (one picked here, or one already given) instead of sending an emergency request. One question per day
   * they could give up; saying no to all of them goes on to the emergency question.
   */
  private async offerMove(date: string): Promise<boolean> {
    if (this.formEmergency() || (this.formOverride() && this.canOverride())) return false;
    const me = this.selfService() || this.auth.isEmployee();
    const picked = [...this.formDays()].filter((d) => !this.isMyRegular(d)).sort();
    const given = this.formMine()
      .filter((r) => !r.emergency && !r.reserved && r.status !== 'REJECTED' && r.date >= this.todayIso && r.date !== date)
      .sort((a, b) => a.date.localeCompare(b.date));
    const choices: { date: string; request?: DayOffRequest }[] = [
      ...picked.map((d) => ({ date: d })),
      ...given.map((r) => ({ date: r.date, request: r })),
    ];
    const long = (d: string) => formatDay(d, { weekday: 'long', month: 'short', day: 'numeric' });
    const short = (d: string) => formatDay(d, { weekday: 'short' });
    for (const [i, c] of choices.entries()) {
      const last = i === choices.length - 1;
      const ok = await this.confirm.ask({
        title: me ? 'Change your day off?' : 'Change their day off?',
        message: c.request
          ? `${me ? "You're" : "They're"} off ${long(c.date)}. Move that day off to ${long(date)}?`
          : `${me ? 'You' : 'They'} picked ${long(c.date)}. Take ${long(date)} instead?`,
        icon: 'bi-arrow-left-right',
        tone: 'primary',
        notes: [
          `${long(date)} still has room, so ${c.request ? "it's given straight away" : 'it can be a normal day off'}: `
            + 'no emergency request needed.',
          ...(c.request ? [`${long(c.date)} becomes a work day.`] : []),
          ...(last ? [`Need both days off? Choose "Keep ${short(c.date)}" to send ${short(date)} as an emergency request.`] : []),
        ],
        confirmText: `Move to ${short(date)}`,
        cancelText: `Keep ${short(c.date)}`,
      });
      if (!ok) continue;
      if (c.request) {
        this.moveTo(c.request, date);
      } else {
        this.formDays.update((set) => {
          const next = new Set(set);
          next.delete(c.date);
          next.add(date);
          return next;
        });
      }
      return true;
    }
    return false;
  }

  /** Moves a day off they already have to another day of the same week (the server checks the day still has room). */
  private moveTo(r: DayOffRequest, date: string): void {
    const fmt = (d: string) => formatDay(d, { weekday: 'short', month: 'short', day: 'numeric' });
    this.saving.set(true);
    this.api.moveDayOff(r.id, date).subscribe({
      next: (moved) => {
        this.saving.set(false);
        const mine = moved.employeeId === this.auth.user()?.id;
        const who = mine ? "You're" : `${moved.employeeName.split(' ')[0]} is`;
        this.toast.success(`${who} now off ${fmt(moved.date)} instead of ${fmt(r.date)}.`);
        this.modalOpen.set(false);
        this.status.set('APPROVED');
        this.load();
      },
      // Not moved (the reason is shown): they keep their day. Refresh the week, it may have changed.
      error: () => {
        this.saving.set(false);
        this.loadTaken();
      },
    });
  }

  /** A full day, or past the weekly limit: asks whether this day should be sent as an emergency request. */
  private async askEmergency(date: string, full = false): Promise<void> {
    const me = this.selfService() || this.auth.isEmployee();
    if (me && this.window()?.oneEmergencyPerMonth && this.window()?.emergencyUsedThisMonth) {
      this.toast.error("You've already used this month's emergency request. Please talk to your manager.");
      return;
    }
    const limit = this.maxDaysPerWeek();
    const when = formatDay(date, { weekday: 'long', month: 'short', day: 'numeric' });
    const already = this.existingNormal() > 0 && this.normalPicks() === 0;
    // A full day stays full: point them to the days that still have room first (emergency is for urgent cases).
    const w = this.window();
    const stillOpen = full && this.normalPicks() < this.formMaxDays()
      ? this.formWeekDates().filter((d) => d !== date && d >= this.todayIso && (!w?.enabled || this.isOpenDay(d))
        && !this.takenBy(d) && !this.formDays().has(d)
        && !this.formMine().some((r) => r.date === d && r.status !== 'REJECTED'))
      : [];
    const openList = stillOpen.map((d) => formatDay(d, { weekday: 'short', month: 'short', day: 'numeric' })).join(', ');
    const ok = await this.confirm.ask({
      title: 'Send an emergency request?',
      message: full
        ? `${when} is ${this.fullReason(date, me)}. Do you want to ask for it as an emergency day off?`
        : `${me ? 'You' : 'They'} can take ${limit} day${limit === 1 ? '' : 's'} off a week` +
        `${already ? `, and ${me ? 'you' : 'they'} already have ${limit === 1 ? 'it' : 'them'}` : ''}. ` +
        `Do you want to ask for ${when} as an emergency day off?`,
      icon: 'bi-exclamation-octagon',
      tone: 'danger',
      notes: [
        ...(stillOpen.length
          ? [`These days still have room for a normal day off: ${openList}. Please pick one of those instead.`]
          : []),
        'An emergency request is only for something urgent. A manager or admin approves or rejects it.',
        ...(this.window()?.oneEmergencyPerMonth ? ['Only one emergency request is allowed each month.'] : []),
      ],
      confirmText: stillOpen.length ? 'It\'s urgent: send emergency' : 'Yes, emergency request',
      cancelText: stillOpen.length ? 'Pick another day' : undefined,
    });
    if (ok) {
      this.formEmergencyDays.update((set) => new Set(set).add(date));
    }
  }

  protected submit(): void {
    const employeeId = this.formEmployeeId();
    const dates = [...this.formDays()].sort();
    const extra = [...this.formEmergencyDays()].sort();
    if (!employeeId || dates.length + extra.length === 0) {
      return;
    }
    this.saving.set(true);
    const emergency = this.formEmergency();
    const override = this.formOverride() && this.canOverride();
    const reason = clean(this.formReason);
    const fmt = (list: { date: string }[]) =>
      list.map((c) => formatDay(c.date, { weekday: 'short', month: 'short', day: 'numeric' })).join(' and ');
    const done = (created: DayOffRequest[], sentEmergency: DayOffRequest[]) => {
      this.saving.set(false);
      this.modalOpen.set(false);
      const messages: string[] = [];
      if (created.length) {
        const days = created.length + ' day' + (created.length > 1 ? 's' : '');
        const mine = created[0].employeeId === this.auth.user()?.id;
        const first = created[0].employeeName.split(' ')[0];
        messages.push(
          override
            ? `${days} off given to ${created[0].employeeName}. They've been told.`
            : emergency
              ? `Emergency request sent for ${fmt(created)}. A manager will decide.`
              : `${mine ? "You're" : first + ' is'} off on ${fmt(created)}.`,
        );
      }
      if (sentEmergency.length) {
        messages.push(`Emergency request sent for ${fmt(sentEmergency)}. A manager will decide.`);
      }
      if (messages.length) this.toast.success(messages.join(' '));
      // Normal requests are given straight away; only emergencies wait.
      this.status.set((emergency && !override) || sentEmergency.length ? 'PENDING' : 'APPROVED');
      this.load();
    };
    // Normal days first: once the week's normal days are used, the extra ones can go as an emergency.
    const sendExtra = (created: DayOffRequest[]) => {
      if (extra.length === 0) {
        done(created, []);
        return;
      }
      this.api.createDayOff({ employeeId, dates: extra, reason, emergency: true, override: false }).subscribe({
        next: (sent) => done(created, sent),
        // The normal days went through; the emergency didn't (the reason is shown by the error toast).
        error: () => (created.length ? done(created, []) : this.saving.set(false)),
      });
    };
    if (dates.length === 0) {
      sendExtra([]);
      return;
    }
    this.api.createDayOff({ employeeId, dates, reason, emergency, override }).subscribe({
      next: (created) => sendExtra(created),
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
