import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { addDays, formatDay, formatWeekRange, today, weekDates, weekStartOf } from '../../core/date-utils';
import { Area, DayOffRequest, DayOffStatus, Employee } from '../../core/models';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';

type StatusTab = DayOffStatus | 'ALL';

@Component({
  selector: 'app-day-off-page',
  imports: [FormsModule, RouterLink, Modal, TitleCasePipe],
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

  protected readonly status = signal<StatusTab>('PENDING');
  protected areaFilter: number | null = null;
  protected fromFilter = weekStartOf(today());
  protected toFilter = '';

  // New request modal
  protected readonly modalOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formArea = signal<number | null>(null);
  protected readonly formEmployees = signal<Employee[]>([]);
  protected readonly formEmployeeId = signal<number | null>(null);
  protected readonly formWeek = signal(addDays(weekStartOf(today()), 7));
  protected readonly formDays = signal<Set<string>>(new Set());
  protected formReason = '';

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
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    const status = this.status();
    this.api
      .dayOffRequests({
        areaId: this.areaFilter,
        status: status === 'ALL' ? null : status,
        from: this.fromFilter || null,
        to: this.toFilter || null,
      })
      .subscribe({
        next: (list) => {
          this.requests.set(list);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  protected approve(r: DayOffRequest): void {
    this.busyId.set(r.id);
    this.api.approveDayOff(r.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success(`Approved ${r.employeeName} — ${formatDay(r.date, { weekday: 'short', month: 'short', day: 'numeric' })}.`);
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
    this.loadFormEmployees();
    this.modalOpen.set(true);
  }

  protected onFormAreaChange(areaId: number | null): void {
    this.formArea.set(areaId);
    this.formEmployeeId.set(null);
    this.loadFormEmployees();
  }

  protected shiftFormWeek(weeks: number): void {
    this.formWeek.update((w) => addDays(w, weeks * 7));
    this.formDays.set(new Set());
  }

  protected toggleDay(date: string): void {
    this.formDays.update((set) => {
      const next = new Set(set);
      if (next.has(date)) {
        next.delete(date);
      } else if (next.size < this.maxDaysPerWeek) {
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
    this.api.createDayOff({ employeeId, dates, reason: this.formReason.trim() || null }).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(`${created.length} day${created.length > 1 ? 's' : ''} requested for ${created[0].employeeName}.`);
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
