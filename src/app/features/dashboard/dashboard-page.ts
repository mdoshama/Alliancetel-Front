import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { DestroyRef, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService } from '../../core/api.service';
import { LiveService } from '../../core/live.service';
import { AuthService } from '../../core/auth.service';
import { formatDay, today, weekStartOf } from '../../core/date-utils';
import { Area, DayOffRequest, EodStatus, EodStoreDay, PerfLeaderboard, UpcomingBirthday } from '../../core/models';
import { periodRange } from '../../core/periods';
import { EOD_STATUS_LABELS } from '../eod/eod-page';

/** A store's close-out today, with the area it belongs to (admins see every area). */
interface StoreToday extends EodStoreDay {
  areaName: string;
}

/**
 * The operations overview for admins and managers: today's close-outs, sales this month, top performers, and the
 * scheduling work waiting (day-off requests, staff by area). Every block links to the page that has the detail.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, CurrencyPipe, DecimalPipe],
  templateUrl: './dashboard-page.html',
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly live = inject(LiveService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);

  protected readonly areas = signal<Area[]>([]);
  protected readonly pending = signal<DayOffRequest[]>([]);
  protected readonly stores = signal<StoreToday[]>([]);
  protected readonly month = signal<PerfLeaderboard | null>(null);
  protected readonly loaded = signal(false);
  /** Birthdays in the next 30 days (admins: everyone; managers: their area). */
  protected readonly birthdays = signal<UpcomingBirthday[]>([]);
  protected readonly birthdaysLoaded = signal(false);
  protected readonly salesLoaded = signal(false);
  protected readonly format = formatDay;
  protected readonly statusLabels = EOD_STATUS_LABELS;
  protected readonly today = today();
  protected readonly monthRange = periodRange('month');

  protected readonly activeAreas = computed(() => this.areas().filter((a) => a.active));
  protected readonly totalStaff = computed(() => this.activeAreas().reduce((sum, a) => sum + a.employeeCount, 0));
  protected readonly largestArea = computed(() => Math.max(1, ...this.activeAreas().map((a) => a.employeeCount)));

  protected readonly closedToday = computed(
    () => this.stores().filter((s) => s.status === 'SUBMITTED' || s.status === 'APPROVED').length,
  );
  protected readonly salesToday = computed(() => this.stores().reduce((sum, s) => sum + s.totalSale, 0));
  protected readonly topPerformers = computed(() =>
    [...(this.month()?.employees ?? [])]
      .filter((e) => e.boxes > 0 || e.accessories > 0)
      .sort((a, b) => b.boxes - a.boxes || b.accessories - a.accessories)
      .slice(0, 5),
  );
  protected readonly topBoxes = computed(() => Math.max(1, ...this.topPerformers().map((e) => e.boxes)));
  /** Boxes per day this month, for the small trend bars. */
  protected readonly trend = computed(() => this.month()?.days ?? []);
  protected readonly trendMax = computed(() => Math.max(1, ...this.trend().map((d) => d.boxes)));

  protected readonly greeting = computed(() => {
    const h = new Date().getHours();
    const first = this.auth.user()?.fullName?.split(' ')[0] ?? '';
    return `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}${first ? ', ' + first : ''}`;
  });

  ngOnInit(): void {
    this.refresh();
    // Changes made on another device show up without a refresh.
    this.live.on(['dayoff', 'schedule', 'eod', 'people'], this.destroyRef, () => this.refresh());
  }

  private refresh(): void {
    this.api.areas().subscribe((list) => {
      this.areas.set(list);
      this.loaded.set(true);
      this.loadToday(list);
    });
    this.api
      .upcomingBirthdays(30)
      .pipe(catchError(() => of([] as UpcomingBirthday[])))
      .subscribe((list) => {
        this.birthdays.set(list);
        this.birthdaysLoaded.set(true);
      });
    this.api
      .dayOffRequests({ status: 'PENDING', from: weekStartOf(today()) })
      .subscribe((list) => this.pending.set(list));
    this.api
      .leaderboard({ from: this.monthRange.from, to: this.monthRange.to })
      .pipe(catchError(() => of(null)))
      .subscribe((board) => {
        this.month.set(board);
        this.salesLoaded.set(true);
      });
  }

  /** Managers get their own area's stores; admins get every active area's. */
  private loadToday(areas: Area[]): void {
    const wanted: { id: number | null; name: string }[] = this.auth.isAdmin()
      ? areas.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))
      : [{ id: null, name: this.auth.user()?.areaName ?? '' }];
    if (wanted.length === 0) {
      return;
    }
    forkJoin(
      wanted.map((a) =>
        this.api.eodDay(a.id, this.today).pipe(
          map((day) => day.stores.map((s) => ({ ...s, areaName: a.name }))),
          catchError(() => of([] as StoreToday[])),
        ),
      ),
    ).subscribe((lists) => this.stores.set(lists.flat()));
  }

  /** "Today", "Tomorrow", "In 5 days". */
  protected whenLabel(days: number): string {
    return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
  }

  protected statusClass(status: EodStatus | null): string {
    return status === 'APPROVED'
      ? 'text-bg-success'
      : status === 'SUBMITTED'
        ? 'text-bg-primary'
        : status === 'OPEN'
          ? 'text-bg-warning'
          : 'text-bg-light border';
  }
}
