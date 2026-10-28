import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Area, DayHours, Store } from '../../core/models';
import { STORE_PALETTE } from '../../core/store-colors';
import {
  DAY_SHORT,
  DEFAULT_CLOSES,
  DEFAULT_OPENS,
  WEEK_DAYS,
  hhmm,
  hoursError,
  summarizeWeek,
} from '../../core/store-hours';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';

interface AreaGroup {
  areaId: number;
  areaName: string;
  stores: Store[];
  staff: number;
}

@Component({
  selector: 'app-stores-page',
  imports: [ReactiveFormsModule, FormsModule, RouterLink, Modal],
  templateUrl: './stores-page.html',
})
export class StoresPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmService);

  protected readonly areas = signal<Area[]>([]);
  protected readonly stores = signal<Store[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<Store | null>(null);
  protected areaFilter: number | null = null;

  protected readonly dayShort = DAY_SHORT;
  protected readonly summarizeWeek = summarizeWeek;
  protected readonly hoursError = hoursError;
  /** The seven days being edited in the form, Monday first. */
  protected hoursRows: DayHours[] = defaultWeek();
  protected hoursTouched = false;
  protected readonly palette = STORE_PALETTE;
  /** Color being edited; null on a new store means "pick one automatically". */
  protected color: string | null = null;

  /** Colors already used by other stores in the area being edited. */
  protected usedColors(): Map<string, string> {
    const areaId = this.form.controls.areaId.value;
    const current = this.editing()?.id;
    const used = new Map<string, string>();
    for (const s of this.stores()) {
      if (s.areaId === areaId && s.id !== current) {
        used.set(s.color.toUpperCase(), s.name);
      }
    }
    return used;
  }

  /** Stores grouped under their area, in area order. */
  protected readonly groups = computed<AreaGroup[]>(() => {
    const byArea = new Map<number, AreaGroup>();
    for (const s of this.stores()) {
      const g = byArea.get(s.areaId) ?? { areaId: s.areaId, areaName: s.areaName, stores: [], staff: 0 };
      g.stores.push(s);
      g.staff += s.employeeCount;
      byArea.set(s.areaId, g);
    }
    return [...byArea.values()].sort((a, b) => a.areaName.localeCompare(b.areaName));
  });

  protected readonly form = this.fb.nonNullable.group({
    areaId: [null as number | null, Validators.required],
    name: ['', [Validators.required, Validators.maxLength(100)]],
    code: ['', Validators.maxLength(12)],
    address: ['', Validators.maxLength(255)],
    minStaffPerDay: [1, [Validators.required, Validators.min(0), Validators.max(50)]],
    active: [true],
  });

  ngOnInit(): void {
    this.api.areas().subscribe((list) => this.areas.set(list));
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.stores(this.areaFilter).subscribe({
      next: (list) => {
        this.stores.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected openCreate(areaId: number | null = this.areaFilter): void {
    this.editing.set(null);
    this.form.reset({ areaId, name: '', code: '', address: '', minStaffPerDay: 1, active: true });
    this.hoursRows = defaultWeek();
    this.hoursTouched = false;
    this.color = null;
    this.modalOpen.set(true);
  }

  protected openEdit(store: Store): void {
    this.editing.set(store);
    this.form.reset({
      areaId: store.areaId,
      name: store.name,
      code: store.code ?? '',
      address: store.address ?? '',
      minStaffPerDay: store.minStaffPerDay,
      active: store.active,
    });
    this.hoursRows = WEEK_DAYS.map((day) => {
      const h = store.hours?.find((x) => x.day === day);
      return h
        ? { day, opensAt: hhmm(h.opensAt) || DEFAULT_OPENS, closesAt: hhmm(h.closesAt) || DEFAULT_CLOSES, closed: h.closed }
        : { day, opensAt: DEFAULT_OPENS, closesAt: DEFAULT_CLOSES, closed: false };
    });
    this.hoursTouched = false;
    this.color = store.color?.toUpperCase() ?? null;
    this.modalOpen.set(true);
  }

  protected save(): void {
    const v = this.form.getRawValue();
    this.hoursTouched = true;
    if (this.form.invalid || v.areaId == null || this.hoursRows.some((h) => hoursError(h))) {
      this.form.markAllAsTouched();
      return;
    }
    const body = {
      areaId: Number(v.areaId),
      name: v.name.trim(),
      code: v.code.trim() || null,
      address: v.address.trim() || null,
      minStaffPerDay: Number(v.minStaffPerDay),
      active: v.active,
      hours: this.hoursRows.map((h) => ({
        day: h.day,
        opensAt: h.closed ? null : h.opensAt,
        closesAt: h.closed ? null : h.closesAt,
        closed: h.closed,
      })),
      ...(this.color ? { color: this.color } : {}),
    };
    const current = this.editing();
    const request = current ? this.api.updateStore(current.id, body) : this.api.createStore(body);
    this.saving.set(true);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(`${saved.name} ${current ? 'updated' : 'added to ' + saved.areaName}.`);
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  /** Copies one day's hours to every day of the week. */
  protected copyToAll(from: DayHours): void {
    this.hoursRows = this.hoursRows.map((h) => ({ ...h, opensAt: from.opensAt, closesAt: from.closesAt, closed: from.closed }));
  }

  protected async remove(store: Store): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete ${store.name}?`,
      message: `This permanently removes the store from ${store.areaName}.`,
      icon: 'bi-trash',
      tone: 'danger',
      notes: ['Stores with staff or schedule history can only be deactivated (Edit → Active).'],
      confirmText: 'Delete store',
    });
    if (!ok) {
      return;
    }
    this.api.deleteStore(store.id).subscribe(() => {
      this.toast.success(`${store.name} deleted.`);
      this.load();
    });
  }
}

function defaultWeek(): DayHours[] {
  return WEEK_DAYS.map((day) => ({ day, opensAt: DEFAULT_OPENS, closesAt: DEFAULT_CLOSES, closed: false }));
}
