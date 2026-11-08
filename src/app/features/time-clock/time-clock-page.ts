import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { addDays, formatDay, today } from '../../core/date-utils';
import { Area, TimeClockDay, TimeClockRow } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';

/**
 * Time Clock. Back office staff (and admins) watch the store cameras and clock people in: clocking in is required for
 * everyone on the published schedule, clocking out is optional. Managers can follow their own area.
 */
@Component({
  selector: 'app-time-clock-page',
  imports: [FormsModule, Modal],
  templateUrl: './time-clock-page.html',
})
export class TimeClockPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly areas = signal<Area[]>([]);
  protected areaId: number | null = null;
  protected readonly date = signal(today());
  protected readonly todayIso = today();
  protected readonly day = signal<TimeClockDay | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal<number | null>(null);
  protected readonly showOthers = signal(false);
  protected readonly search = signal('');
  protected readonly filter = signal<'all' | 'missing' | 'in' | 'late'>('all');
  protected readonly format = formatDay;

  /** Editing an entry, or clocking in with a chosen time. */
  protected readonly editOpen = signal(false);
  protected readonly editRow = signal<TimeClockRow | null>(null);
  protected editIn = '';
  protected editOut = '';
  protected editNote = '';

  /** Scheduled people, filtered, grouped by store. */
  protected readonly groups = computed(() => {
    const d = this.day();
    if (!d) return [];
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    const rows = d.rows
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q))
      .filter((r) =>
        f === 'missing' ? r.missing : f === 'in' ? !!r.clockIn : f === 'late' ? r.minutesLate > 0 : true,
      );
    const map = new Map<string, { store: string; color: string | null; opensAt: string | null; rows: TimeClockRow[] }>();
    for (const r of rows) {
      const key = r.storeName ?? 'No store';
      if (!map.has(key)) map.set(key, { store: key, color: r.storeColor, opensAt: r.opensAt, rows: [] });
      map.get(key)!.rows.push(r);
    }
    return [...map.values()];
  });

  protected readonly otherRows = computed(() => {
    const q = this.search().trim().toLowerCase();
    return (this.day()?.others ?? []).filter(
      (r) => !q || r.name.toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    if (!this.auth.hasRole('MANAGER')) {
      this.api.areas().subscribe((list) => this.areas.set(list.filter((a) => a.active)));
    }
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.timeClock(this.areaId, this.date()).subscribe({
      next: (d) => {
        this.day.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected shiftDay(days: number): void {
    const next = addDays(this.date(), days);
    if (next > this.todayIso) return;
    this.date.set(next);
    this.load();
  }

  protected setDate(value: string): void {
    if (!value || value > this.todayIso) return;
    this.date.set(value);
    this.load();
  }

  /** "10:02 AM" from "10:02:00". */
  protected time(t: string | null): string {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const suffix = h < 12 ? 'AM' : 'PM';
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  /** Clock in right now (today) — one tap while watching the camera. */
  protected clockInNow(r: TimeClockRow): void {
    if (!this.day()?.today) {
      this.openEdit(r);
      return;
    }
    this.busy.set(r.employeeId);
    this.api.clockIn({ employeeId: r.employeeId, date: this.date(), storeId: r.storeId }).subscribe({
      next: (row) => {
        this.busy.set(null);
        this.toast.success(`${r.name} clocked in at ${this.time(row.clockIn)}.`);
        this.load();
      },
      error: () => this.busy.set(null),
    });
  }

  protected clockOutNow(r: TimeClockRow): void {
    if (r.entryId == null) return;
    if (!this.day()?.today) {
      this.openEdit(r);
      return;
    }
    this.busy.set(r.employeeId);
    this.api.clockOut(r.entryId, null).subscribe({
      next: (row) => {
        this.busy.set(null);
        this.toast.success(`${r.name} clocked out at ${this.time(row.clockOut)}.`);
        this.load();
      },
      error: () => this.busy.set(null),
    });
  }

  /** Clock in with a chosen time, or correct an entry. */
  protected openEdit(r: TimeClockRow): void {
    this.editRow.set(r);
    this.editIn = (r.clockIn ?? r.opensAt ?? '').slice(0, 5);
    this.editOut = (r.clockOut ?? '').slice(0, 5);
    this.editNote = r.note ?? '';
    this.editOpen.set(true);
  }

  protected saveEdit(): void {
    const r = this.editRow();
    if (!r || !this.editIn) return;
    const done = (msg: string) => {
      this.editOpen.set(false);
      this.toast.success(msg);
      this.load();
    };
    if (r.entryId == null) {
      this.api
        .clockIn({ employeeId: r.employeeId, date: this.date(), time: this.editIn, storeId: r.storeId, note: this.editNote || null })
        .subscribe((row) => {
          if (this.editOut && row.entryId != null) {
            this.api.clockOut(row.entryId, this.editOut).subscribe(() => done(`${r.name} clocked in and out.`));
          } else {
            done(`${r.name} clocked in at ${this.time(row.clockIn)}.`);
          }
        });
    } else {
      this.api
        .correctTime(r.entryId, { clockIn: this.editIn, clockOut: this.editOut || null, note: this.editNote || null })
        .subscribe(() => done(`${r.name}'s times updated.`));
    }
  }

  protected async remove(r: TimeClockRow): Promise<void> {
    if (r.entryId == null) return;
    const ok = await this.confirm.ask({
      title: `Remove ${r.name}'s clock-in?`,
      message: 'Use this if they were clocked in by mistake.',
      icon: 'bi-trash',
      tone: 'danger',
      confirmText: 'Remove',
    });
    if (!ok) return;
    this.api.deleteTime(r.entryId).subscribe(() => {
      this.editOpen.set(false);
      this.toast.success('Clock-in removed.');
      this.load();
    });
  }
}
