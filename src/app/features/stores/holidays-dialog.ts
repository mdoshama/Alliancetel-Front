import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { formatDay, today } from '../../core/date-utils';
import { Store, StoreClosure } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';

/** A holiday suggestion: the next date it falls on. */
interface Suggestion {
  label: string;
  date: string;
}

/**
 * Holidays: close every store in an area, or only some, on a date (Thanksgiving, Christmas…). Schedules not yet
 * published move people off the closed stores that day; new schedules leave the day out.
 */
@Component({
  selector: 'app-holidays-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Modal],
  template: `
    <app-modal [open]="open()" [title]="'Holidays · ' + areaName()" (closed)="closed.emit()">
      <!-- Closed days coming up -->
      @if (closures().length) {
        <ul class="hol-list">
          @for (c of closures(); track c.date) {
            <li class="hol-item">
              <div class="hol-date">
                <span class="hol-dow">{{ fmt(c.date, { weekday: 'short' }) }}</span>
                <span class="hol-dom">{{ fmt(c.date, { day: 'numeric' }) }}</span>
                <span class="hol-mon">{{ fmt(c.date, { month: 'short' }) }}</span>
              </div>
              <div class="flex-grow-1 min-w-0">
                <div class="fw-semibold">{{ c.label || 'Closed' }}</div>
                <div class="hol-stores">
                  @if (c.wholeArea) {
                    <span class="hol-all"><i class="bi bi-shop"></i> All stores</span>
                  } @else {
                    @for (s of c.stores; track s.id) {
                      <span class="hol-store" [style.--store-color]="s.color">
                        <span class="store-dot"></span>{{ s.name }}
                        <button type="button" class="hol-x" (click)="reopen(c, s.id)" [disabled]="busy()"
                                [attr.aria-label]="'Open ' + s.name + ' again'"><i class="bi bi-x"></i></button>
                      </span>
                    }
                  }
                </div>
              </div>
              <button type="button" class="btn btn-sm btn-light" (click)="reopen(c, null)" [disabled]="busy()">Reopen</button>
            </li>
          }
        </ul>
      } @else if (!loading()) {
        <div class="hol-empty"><i class="bi bi-calendar-check"></i> No closed days coming up</div>
      }

      <!-- Close a day -->
      <div class="hol-add">
        <div class="hol-add-title">Close a day</div>
        <div class="hol-chips">
          @for (s of suggestions(); track s.label) {
            <button type="button" class="hol-chip" [class.active]="date === s.date" (click)="pick(s)">
              {{ s.label }} <span>{{ fmt(s.date, { month: 'short', day: 'numeric' }) }}</span>
            </button>
          }
        </div>
        <div class="row g-2">
          <div class="col-6">
            <label class="form-label small" for="holDate">Date</label>
            <input id="holDate" type="date" class="form-control" [min]="todayIso" [(ngModel)]="date" />
          </div>
          <div class="col-6">
            <label class="form-label small" for="holLabel">Name <span class="text-muted-2">(optional)</span></label>
            <input id="holLabel" type="text" class="form-control" maxlength="60" placeholder="Thanksgiving" [(ngModel)]="label" />
          </div>
        </div>
        <div class="seg mt-3" role="radiogroup" aria-label="Which stores">
          <button type="button" role="radio" [class.active]="all()" [attr.aria-checked]="all()" (click)="all.set(true)">
            All stores
          </button>
          <button type="button" role="radio" [class.active]="!all()" [attr.aria-checked]="!all()" (click)="all.set(false)">
            Pick stores
          </button>
        </div>
        @if (!all()) {
          <div class="hol-pick">
            @for (s of activeStores(); track s.id) {
              <label class="hol-pick-item" [class.on]="picked().has(s.id)" [style.--store-color]="s.color">
                <input type="checkbox" class="form-check-input" [checked]="picked().has(s.id)" (change)="toggle(s.id)" />
                <span class="store-dot"></span>{{ s.name }}
              </label>
            }
          </div>
        }
      </div>

      <ng-container modal-footer>
        <button type="button" class="btn btn-light" (click)="closed.emit()">Done</button>
        <button type="button" class="btn btn-danger" [disabled]="busy() || !date || (!all() && picked().size === 0)"
                (click)="close()">
          @if (busy()) { <span class="spinner-border spinner-border-sm me-1"></span> }
          <i class="bi bi-door-closed me-1"></i>Close {{ all() ? 'all stores' : picked().size + ' store' + (picked().size === 1 ? '' : 's') }}
        </button>
      </ng-container>
    </app-modal>
  `,
})
export class HolidaysDialog {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly open = input(false);
  readonly areaId = input<number | null>(null);
  readonly areaName = input('');
  /** The area's stores. */
  readonly stores = input<Store[]>([]);
  readonly closed = output<void>();

  protected readonly todayIso = today();
  protected readonly closures = signal<StoreClosure[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly all = signal(true);
  protected readonly picked = signal<Set<number>>(new Set());
  protected date = '';
  protected label = '';

  protected readonly activeStores = computed(() => this.stores().filter((s) => s.active));
  protected readonly suggestions = computed(() => upcomingHolidays(this.todayIso));

  constructor() {
    effect(() => {
      const areaId = this.areaId();
      if (this.open() && areaId != null) {
        this.load(areaId);
      }
    });
  }

  protected fmt(date: string, options: Intl.DateTimeFormatOptions): string {
    return formatDay(date, options);
  }

  protected pick(s: Suggestion): void {
    this.date = s.date;
    this.label = s.label;
  }

  protected toggle(id: number): void {
    const next = new Set(this.picked());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.picked.set(next);
  }

  private load(areaId: number): void {
    this.loading.set(true);
    this.api.storeClosures(areaId).subscribe({
      next: (list) => {
        this.closures.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected close(): void {
    const areaId = this.areaId();
    if (areaId == null || !this.date) return;
    this.busy.set(true);
    const storeIds = this.all() ? [] : [...this.picked()];
    this.api.closeStores({ areaId, date: this.date, label: this.label.trim() || null, storeIds }).subscribe({
      next: (list) => {
        this.closures.set(list);
        this.busy.set(false);
        this.toast.success(`Closed ${formatDay(this.date, { weekday: 'short', month: 'short', day: 'numeric' })}.`);
        this.date = '';
        this.label = '';
        this.picked.set(new Set());
      },
      error: () => this.busy.set(false),
    });
  }

  protected reopen(c: StoreClosure, storeId: number | null): void {
    const areaId = this.areaId();
    if (areaId == null) return;
    this.busy.set(true);
    this.api.reopenStores(areaId, c.date, storeId).subscribe({
      next: (list) => {
        this.closures.set(list);
        this.busy.set(false);
        this.toast.success('Open again.');
      },
      error: () => this.busy.set(false),
    });
  }
}

/** The next date of the usual US store holidays, soonest first (the next 6). */
export function upcomingHolidays(fromIso: string): Suggestion[] {
  const from = new Date(fromIso + 'T00:00:00');
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  /** The nth weekday (0 = Sunday) of a month; n = -1 for the last one. */
  const nth = (year: number, month: number, weekday: number, n: number) => {
    if (n > 0) {
      const d = new Date(year, month, 1);
      d.setDate(1 + ((weekday - d.getDay() + 7) % 7) + (n - 1) * 7);
      return d;
    }
    const d = new Date(year, month + 1, 0);
    d.setDate(d.getDate() - ((d.getDay() - weekday + 7) % 7));
    return d;
  };
  const easter = (y: number) => {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    return new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
  };
  const list: Suggestion[] = [];
  for (const y of [from.getFullYear(), from.getFullYear() + 1]) {
    list.push(
      { label: "New Year's Day", date: iso(new Date(y, 0, 1)) },
      { label: 'Easter', date: iso(easter(y)) },
      { label: 'Memorial Day', date: iso(nth(y, 4, 1, -1)) },
      { label: 'July 4th', date: iso(new Date(y, 6, 4)) },
      { label: 'Labor Day', date: iso(nth(y, 8, 1, 1)) },
      { label: 'Thanksgiving', date: iso(nth(y, 10, 4, 4)) },
      { label: 'Christmas Eve', date: iso(new Date(y, 11, 24)) },
      { label: 'Christmas', date: iso(new Date(y, 11, 25)) },
      { label: "New Year's Eve", date: iso(new Date(y, 11, 31)) },
    );
  }
  return list.filter((s) => s.date >= fromIso).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
}
