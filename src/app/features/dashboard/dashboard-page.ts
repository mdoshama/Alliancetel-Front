import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LiveService } from '../../core/live.service';
import { addDays, formatDay, formatWeekRange, today, weekStartOf } from '../../core/date-utils';
import {
  Area,
  DayOffRequest,
  DayHours,
  RequestWindow,
  Schedule,
  UpcomingBirthday,
  WeekRequestStatus,
} from '../../core/models';

/** One store on the floor today: who works there against its minimum. */
interface FloorStore {
  storeId: number;
  name: string;
  color: string;
  min: number;
  closed: boolean;
  hours: DayHours | null;
  people: { id: number; name: string }[];
  short: boolean;
}

/** One area's scheduling picture: this week's schedule, next week's, and who picked their days off. */
interface AreaWeek {
  area: Area;
  thisWeek: Schedule | null;
  nextWeek: Schedule | null;
  requests: WeekRequestStatus | null;
}

/**
 * The scheduling overview for admins and managers: who is working today and where, how this week and next week
 * stand for each area, emergency requests waiting, and birthdays coming up. Every block links to its page.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink],
  templateUrl: './dashboard-page.html',
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly live = inject(LiveService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);

  protected readonly format = formatDay;
  protected readonly today = today();
  protected readonly thisMonday = weekStartOf(this.today);
  protected readonly nextMonday = addDays(this.thisMonday, 7);
  protected readonly thisWeekLabel = formatWeekRange(this.thisMonday);
  protected readonly nextWeekLabel = formatWeekRange(this.nextMonday);

  protected readonly loaded = signal(false);
  protected readonly weeks = signal<AreaWeek[]>([]);
  protected readonly window = signal<RequestWindow | null>(null);
  protected readonly emergencies = signal<DayOffRequest[]>([]);
  protected readonly emergencyCount = signal(0);
  protected readonly birthdays = signal<UpcomingBirthday[]>([]);
  protected readonly birthdaysLoaded = signal(false);
  /** Admins with several areas pick which area's floor to see. */
  protected readonly floorAreaId = signal<number | null>(null);

  protected readonly greeting = computed(() => {
    const h = new Date().getHours();
    const first = this.auth.user()?.fullName?.split(' ')[0] ?? '';
    return `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}${first ? ', ' + first : ''}`;
  });

  protected readonly scopeName = computed(() =>
    this.auth.isAdmin() ? 'AllianceTel' : (this.auth.user()?.areaName ?? 'your area'),
  );

  // ---------- Today's numbers, across the areas shown ----------

  protected readonly workingToday = computed(() => this.sumToday((s, i) => s.rows.filter((r) => r.days[i]?.type === 'WORK').length));
  protected readonly offToday = computed(() => this.sumToday((s, i) => s.rows.filter((r) => r.days[i] && r.days[i].type !== 'WORK').length));
  protected readonly onSchedule = computed(() => this.sumToday((s) => s.rows.length));
  protected readonly gapsThisWeek = computed(() =>
    this.weeks().reduce((n, w) => n + (w.thisWeek?.coverageGaps.filter((g) => g.date >= this.today).length ?? 0), 0),
  );
  /** Any area has this week's schedule (so today's numbers mean something). */
  protected readonly hasThisWeek = computed(() => this.weeks().some((w) => !!w.thisWeek));

  private sumToday(count: (s: Schedule, dayIndex: number) => number): number {
    return this.weeks().reduce((n, w) => {
      const s = w.thisWeek;
      const i = s ? s.dates.indexOf(this.today) : -1;
      return n + (s && i >= 0 ? count(s, i) : 0);
    }, 0);
  }

  // ---------- On the floor today ----------

  protected readonly floorWeek = computed(() => {
    const list = this.weeks();
    return list.find((w) => w.area.id === this.floorAreaId()) ?? list[0] ?? null;
  });

  protected readonly floor = computed<FloorStore[]>(() => {
    const s = this.floorWeek()?.thisWeek;
    const i = s ? s.dates.indexOf(this.today) : -1;
    if (!s || i < 0) return [];
    return s.storeCoverage
      .filter((c) => c.storeId !== null)
      .map((c) => {
        const people = s.rows
          .filter((r) => r.days[i]?.type === 'WORK' && r.days[i].storeId === c.storeId)
          .map((r) => ({ id: r.employeeId, name: r.employeeName }))
          .sort((a, b) => a.name.localeCompare(b.name));
        const hours = c.dailyHours[i] ?? null;
        const closed = !!hours?.closed;
        return {
          storeId: c.storeId as number,
          name: c.storeName,
          color: c.color ?? '#475569',
          min: c.minStaffPerDay,
          closed,
          hours,
          people,
          short: !closed && people.length < c.minStaffPerDay,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly floorOff = computed(() => {
    const s = this.floorWeek()?.thisWeek;
    const i = s ? s.dates.indexOf(this.today) : -1;
    if (!s || i < 0) return [];
    return s.rows
      .filter((r) => r.days[i] && r.days[i].type !== 'WORK')
      .map((r) => r.employeeName)
      .sort((a, b) => a.localeCompare(b));
  });

  ngOnInit(): void {
    this.refresh();
    // Changes made on another device show up without a refresh.
    this.live.on(['dayoff', 'schedule', 'people'], this.destroyRef, () => this.refresh());
  }

  private refresh(): void {
    this.api.dayOffWindow().subscribe({ next: (w) => this.window.set(w), error: () => this.window.set(null) });
    this.api
      .dayOffRequestsPage({ status: 'PENDING', emergency: true, from: this.thisMonday, page: 0, size: 5 })
      .subscribe({
        next: (p) => {
          this.emergencies.set(p.content);
          this.emergencyCount.set(p.totalElements);
        },
        error: () => undefined,
      });
    this.api
      .upcomingBirthdays(30)
      .pipe(catchError(() => of([] as UpcomingBirthday[])))
      .subscribe((list) => {
        this.birthdays.set(list.slice(0, 6));
        this.birthdaysLoaded.set(true);
      });
    this.api.areas().subscribe({
      next: (areas) => this.loadWeeks(this.myAreas(areas)),
      error: () => this.loaded.set(true),
    });
  }

  /** Admins see every active area; managers their own. */
  private myAreas(areas: Area[]): Area[] {
    const active = areas.filter((a) => a.active);
    if (this.auth.isAdmin()) return active.sort((a, b) => a.name.localeCompare(b.name));
    const mine = this.auth.user()?.areaId;
    return active.filter((a) => a.id === mine);
  }

  private loadWeeks(areas: Area[]): void {
    if (areas.length === 0) {
      this.weeks.set([]);
      this.loaded.set(true);
      return;
    }
    forkJoin(
      areas.map((area) =>
        forkJoin({
          thisWeek: this.api.schedule(area.id, this.thisMonday).pipe(catchError(() => of(null))),
          nextWeek: this.api.schedule(area.id, this.nextMonday).pipe(catchError(() => of(null))),
          requests: this.api.weekRequests(area.id, this.nextMonday).pipe(catchError(() => of(null))),
        }),
      ),
    ).subscribe((results) => {
      this.weeks.set(results.map((r, i) => ({ area: areas[i], ...r })));
      if (this.floorAreaId() == null || !areas.some((a) => a.id === this.floorAreaId())) {
        this.floorAreaId.set(areas[0].id);
      }
      this.loaded.set(true);
    });
  }

  // ---------- Helpers for the template ----------

  /** "Published", "Draft" or "Not made yet", with its badge style. */
  protected weekState(s: Schedule | null): { label: string; css: string; icon: string } {
    if (!s) return { label: 'Not made yet', css: 'is-none', icon: 'bi-dash-circle' };
    return s.status === 'PUBLISHED'
      ? { label: 'Published', css: 'is-published', icon: 'bi-check-circle-fill' }
      : { label: 'Draft', css: 'is-draft', icon: 'bi-pencil-square' };
  }

  protected percent(part: number, whole: number): number {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
  }

  protected upcomingGaps(s: Schedule | null): number {
    return s ? s.coverageGaps.filter((g) => g.date >= this.today).length : 0;
  }

  protected hoursLabel(h: DayHours | null): string {
    if (!h || h.closed || !h.opensAt || !h.closesAt) return '';
    return `${this.time(h.opensAt)} – ${this.time(h.closesAt)}`;
  }

  private time(t: string): string {
    const [hh, mm] = t.split(':').map(Number);
    const suffix = hh >= 12 ? 'pm' : 'am';
    const h12 = hh % 12 || 12;
    return mm ? `${h12}:${String(mm).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
  }

  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  }

  /** "Maria Garcia" → "Maria G." */
  protected shortName(name: string): string {
    const parts = name.trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  }

  /** "Today", "Tomorrow", "In 5 days". */
  protected whenLabel(days: number): string {
    return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
  }

  protected short(d: string): string {
    return formatDay(d, { month: 'short', day: 'numeric' });
  }
}
