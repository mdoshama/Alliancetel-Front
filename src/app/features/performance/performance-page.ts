import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { formatDay } from '../../core/date-utils';
import { Area, EodCategoryOption, PerfEmployeeStats, PerfLeaderboard, Store } from '../../core/models';
import { PERIOD_LABELS, PeriodKey, periodRange } from '../../core/periods';
import { BarItem, BarList } from '../../shared/bar-list';
import { DayColumns } from '../../shared/day-columns';

type Metric = 'boxes' | 'accessories';
type SortKey = 'boxes' | 'accessories' | 'perShift' | 'name';

/**
 * Everyone's sales for a period (admins: any area; managers: their own), from the EOD credit ledger. "Confirmed"
 * numbers come only from approved EODs — what commission will be paid on.
 */
@Component({
  selector: 'app-performance-page',
  imports: [FormsModule, CurrencyPipe, RouterLink, BarList, DayColumns],
  templateUrl: './performance-page.html',
})
export class PerformancePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly periodLabels = PERIOD_LABELS;
  protected readonly periods: PeriodKey[] = ['week', 'month', 'lastMonth', '30d', 'custom'];
  protected readonly period = signal<PeriodKey>('month');
  protected from = periodRange('month').from;
  protected to = periodRange('month').to;

  protected readonly areas = signal<Area[]>([]);
  protected readonly areaId = signal<number | null>(null);
  protected readonly stores = signal<Store[]>([]);
  protected readonly storeId = signal<number | null>(null);
  protected readonly categories = signal<EodCategoryOption[]>([]);
  protected readonly data = signal<PerfLeaderboard | null>(null);
  protected readonly loading = signal(true);
  protected readonly metric = signal<Metric>('boxes');
  protected readonly sort = signal<SortKey>('boxes');

  protected readonly bars = computed<BarItem[]>(() => {
    const d = this.data();
    if (!d) {
      return [];
    }
    const m = this.metric();
    return [...d.employees]
      .sort((a, b) => (m === 'boxes' ? b.boxes - a.boxes || b.accessories - a.accessories : b.accessories - a.accessories))
      .map((e) => ({
        id: e.employeeId,
        label: e.name,
        value: m === 'boxes' ? e.boxes : e.accessories,
        detail:
          m === 'boxes'
            ? e.byCategory.map((c) => `${c.boxes} ${c.label}`).join(' · ') || 'No boxes'
            : `${e.shifts} shift${e.shifts === 1 ? '' : 's'}` + (e.accessoriesPerShift != null ? ` · $${e.accessoriesPerShift.toFixed(2)} per shift` : ''),
      }));
  });

  protected readonly series = computed(() =>
    (this.data()?.days ?? []).map((d) => ({ date: d.date, value: this.metric() === 'boxes' ? d.boxes : d.accessories })),
  );

  protected readonly rows = computed(() => {
    const list = [...(this.data()?.employees ?? [])];
    const by: Record<SortKey, (a: PerfEmployeeStats, b: PerfEmployeeStats) => number> = {
      boxes: (a, b) => b.boxes - a.boxes || b.accessories - a.accessories,
      accessories: (a, b) => b.accessories - a.accessories,
      perShift: (a, b) => (b.accessoriesPerShift ?? -1) - (a.accessoriesPerShift ?? -1),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return list.sort(by[this.sort()]);
  });

  ngOnInit(): void {
    this.api.eodCategories().subscribe((c) => this.categories.set(c));
    if (this.auth.isAdmin()) {
      this.api.areas().subscribe((list) => this.areas.set(list.filter((a) => a.active)));
    } else {
      this.areaId.set(this.auth.user()?.areaId ?? null);
    }
    this.loadStores();
    this.load();
  }

  protected selectArea(id: number | null): void {
    this.areaId.set(id);
    this.storeId.set(null);
    this.loadStores();
    this.load();
  }

  private loadStores(): void {
    const area = this.areaId();
    if (area == null) {
      this.stores.set([]);
      return;
    }
    this.api.stores(area).subscribe((list) => this.stores.set(list.filter((s) => s.active)));
  }

  protected selectStore(id: number | null): void {
    this.storeId.set(id);
    this.load();
  }

  protected selectPeriod(key: PeriodKey): void {
    this.period.set(key);
    if (key !== 'custom') {
      const r = periodRange(key);
      this.from = r.from;
      this.to = r.to;
      this.load();
    }
  }

  protected customChanged(): void {
    if (this.from && this.to && this.from <= this.to) {
      this.load();
    }
  }

  protected load(): void {
    this.loading.set(true);
    this.api.leaderboard({ areaId: this.areaId(), storeId: this.storeId(), from: this.from, to: this.to }).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected open(id: number): void {
    this.router.navigate(['/performance/employees', id], { queryParams: { from: this.from, to: this.to } });
  }

  protected boxesIn(e: PerfEmployeeStats, category: string): number {
    return e.byCategory.find((c) => c.category === category)?.boxes ?? 0;
  }

  protected rangeLabel(): string {
    const d = this.data();
    if (!d) {
      return '';
    }
    const f = (x: string) => formatDay(x, { month: 'short', day: 'numeric' });
    return d.from === d.to ? f(d.from) : `${f(d.from)} to ${f(d.to)}`;
  }
}
