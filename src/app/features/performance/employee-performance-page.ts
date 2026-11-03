import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { formatDay } from '../../core/date-utils';
import { EOD_STATUS_LABELS } from '../eod/eod-page';
import { PerfProfile, ROLE_LABELS } from '../../core/models';
import { PERIOD_LABELS, PeriodKey, periodRange } from '../../core/periods';
import { BarItem, BarList } from '../../shared/bar-list';
import { DayColumns } from '../../shared/day-columns';

/**
 * One person's sales profile: boxes and accessories for a period, per day, by category and store, and every credit
 * (their sales, sales shared with them, shares of a day's accessories). Employees open their own as "My Performance".
 */
@Component({
  selector: 'app-employee-performance-page',
  imports: [FormsModule, CurrencyPipe, RouterLink, BarList, DayColumns],
  templateUrl: './employee-performance-page.html',
})
export class EmployeePerformancePage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);

  /** Route param; absent on "My Performance". */
  readonly id = input<string>();
  /** Query params carried over from the team page. */
  readonly from = input<string>();
  readonly to = input<string>();

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly statusLabels = EOD_STATUS_LABELS;
  protected readonly periodLabels = PERIOD_LABELS;
  protected readonly periods: PeriodKey[] = ['week', 'month', 'lastMonth', '30d', 'custom'];
  protected readonly format = formatDay;
  protected readonly period = signal<PeriodKey>('month');
  protected fromDate = periodRange('month').from;
  protected toDate = periodRange('month').to;

  protected readonly profile = signal<PerfProfile | null>(null);
  protected readonly loading = signal(true);
  /** The sales list shows the latest 15 until "Show all". */
  protected readonly showAll = signal(false);
  protected readonly visibleRecent = computed(() => {
    const all = this.profile()?.recent ?? [];
    return this.showAll() ? all : all.slice(0, 15);
  });

  protected readonly accessoriesSeries = computed(() =>
    (this.profile()?.days ?? []).map((d) => ({ date: d.date, value: d.accessories })),
  );
  protected readonly boxesSeries = computed(() => (this.profile()?.days ?? []).map((d) => ({ date: d.date, value: d.boxes })));
  protected readonly categoryBars = computed<BarItem[]>(() =>
    (this.profile()?.stats.byCategory ?? []).map((c, i) => ({ id: i, label: c.label, value: c.boxes })),
  );

  ngOnInit(): void {
    const f = this.from();
    const t = this.to();
    if (f && t && /^\d{4}-\d{2}-\d{2}$/.test(f) && /^\d{4}-\d{2}-\d{2}$/.test(t)) {
      this.fromDate = f;
      this.toDate = t;
      this.period.set(this.matchPeriod(f, t));
    }
    this.load();
  }

  private matchPeriod(f: string, t: string): PeriodKey {
    for (const k of ['week', 'month', 'lastMonth', '30d'] as const) {
      const r = periodRange(k);
      if (r.from === f && r.to === t) {
        return k;
      }
    }
    return 'custom';
  }

  protected selectPeriod(key: PeriodKey): void {
    this.period.set(key);
    if (key !== 'custom') {
      const r = periodRange(key);
      this.fromDate = r.from;
      this.toDate = r.to;
      this.load();
    }
  }

  protected customChanged(): void {
    if (this.fromDate && this.toDate && this.fromDate <= this.toDate) {
      this.load();
    }
  }

  protected load(): void {
    const id = Number(this.id());
    const request = id ? this.api.employeePerformance(id, this.fromDate, this.toDate) : this.api.myPerformance(this.fromDate, this.toDate);
    this.loading.set(true);
    request.subscribe({
      next: (p) => {
        this.profile.set(p);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
  }

  protected isMe(): boolean {
    return this.profile()?.employeeId === this.auth.user()?.id;
  }

  protected statusClass(status: string): string {
    return status === 'APPROVED' ? 'text-bg-success' : status === 'SUBMITTED' ? 'text-bg-primary' : 'text-bg-warning';
  }
}
