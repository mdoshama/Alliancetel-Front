import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { formatDay, today } from '../../core/date-utils';
import {
  Area,
  CatalogBrand,
  CatalogDevice,
  EodColleague,
  EodCategory,
  EodCategoryOption,
  EodClosingRequest,
  EodDayOverview,
  EodLine,
  EodLineType,
  EodMonthSummary,
  EodReport,
  EodStatus,
  EodStoreOption,
} from '../../core/models';
import { Modal } from '../../shared/modal';

type Mode = 'report' | 'day' | 'month';

/** Money in whole cents, so live totals add up exactly like the server's. */
const cents = (v: number | null | undefined): number => Math.round((Number(v) || 0) * 100);
const dollars = (c: number): number => c / 100;

export const EOD_STATUS_LABELS: Record<EodStatus, string> = {
  OPEN: 'Open',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
};

/**
 * End of day: replaces the store's daily sheet. Reps add their sales as they go; whoever closes enters the money
 * counted and submits. Managers see every store's day, approve or reopen, and get the month (boxes per rep).
 */
@Component({
  selector: 'app-eod-page',
  imports: [FormsModule, DatePipe, CurrencyPipe, Modal],
  templateUrl: './eod-page.html',
  styleUrl: './eod-page.scss',
})
export class EodPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly auth = inject(AuthService);

  protected readonly statusLabels = EOD_STATUS_LABELS;
  protected readonly format = formatDay;
  protected readonly todayIso = today();

  protected readonly mode = signal<Mode>('report');
  protected readonly areas = signal<Area[]>([]);
  protected readonly areaId = signal<number | null>(null);
  protected readonly stores = signal<EodStoreOption[]>([]);
  protected readonly storeId = signal<number | null>(null);
  protected readonly date = signal(today());
  protected readonly month = signal(today().slice(0, 7));
  protected readonly todayReason = signal<string | null>(null);
  /** The store the schedule puts the rep at today (the hint only applies to it). */
  protected readonly todayStoreId = signal<number | null>(null);

  protected readonly report = signal<EodReport | null>(null);
  protected readonly dayOverview = signal<EodDayOverview | null>(null);
  protected readonly monthSummary = signal<EodMonthSummary | null>(null);
  protected readonly categories = signal<EodCategoryOption[]>([]);
  /** Staff of the store's area, people on today's schedule at the store first. */
  protected readonly colleagues = signal<EodColleague[]>([]);
  protected readonly onShift = computed(() => this.colleagues().filter((c) => c.scheduledHere));
  protected readonly offShift = computed(() => this.colleagues().filter((c) => !c.scheduledHere));
  /** The device list (brands → devices with retail prices), kept by admins. */
  protected readonly brands = signal<CatalogBrand[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);

  // ---------- Sale form ----------
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected formType: EodLineType = 'SALE';
  protected readonly formCategory = signal<EodCategory | null>(null);
  protected formDescription = '';
  protected formQpay: number | null = null;
  /** The subtotal as written on the receipt (typed by the rep). */
  protected formSubtotal: number | null = null;
  protected formSoldFor: number | null = null;
  /** Once the rep types "Sold for" themselves, it stops following QPAY + subtotal. */
  private soldForTyped = false;
  protected formCustomer = '';
  protected formImei = '';
  protected formPhone = '';
  protected formRepId: number | null = null;
  protected readonly formBrandId = signal<number | null>(null);
  /** null = not on the list ("Other / BYOD"): the rep types what was sold. */
  protected readonly formDeviceId = signal<number | null>(null);
  protected readonly formShare = signal<number[]>([]);
  protected formError = signal<string | null>(null);

  // ---------- Closing ----------
  protected closing: Omit<EodClosingRequest, 'storeId' | 'date'> = this.emptyClosing();
  /** Bumped on every edit of the closing form so live figures recompute. */
  protected readonly closingTick = signal(0);
  /** Closing figures typed but not saved yet: kept when the day reloads (e.g. after adding a sale). */
  private closingDirty = false;

  protected readonly needsDevice = computed(
    () => this.categories().find((c) => c.value === this.formCategory())?.needsDevice ?? false,
  );

  /** Live figures: the saved sales plus what's typed in the closing form, using the sheet's formulas. */
  protected readonly live = computed(() => {
    this.closingTick();
    const r = this.report();
    const lines = r?.lines ?? [];
    let subtotal = 0;
    let acc = 0;
    let boxes = 0;
    for (const l of lines) {
      acc += cents(l.accessories);
      if (l.type === 'SALE') {
        subtotal += cents(l.subtotal);
        boxes++;
      }
    }
    const c = this.closing;
    const grand = subtotal + acc;
    const sale = grand + cents(c.qpayTotal) + cents(c.newLayaway);
    const drop = cents(c.cash) + cents(c.credit) + cents(c.finance) + cents(c.layawayRedeem);
    const started = [c.qpayTotal, c.cash, c.credit, c.finance, c.layawayRedeem, c.newLayaway].some(
      (v) => v !== null && v !== undefined && String(v) !== '',
    );
    return {
      /** Someone has started entering the money; until then over/short isn't meaningful. */
      started,
      subtotal: dollars(subtotal),
      accessories: dollars(acc),
      grand: dollars(grand),
      sale: dollars(sale),
      drop: dollars(drop),
      overShort: dollars(drop - sale),
      boxes,
    };
  });

  /** What the accessories part of the sale being typed comes to: sold for − QPAY − subtotal. */
  protected formAccessories(): number {
    return dollars(cents(this.formSoldFor) - cents(this.formQpay) - cents(this.formSubtotal));
  }

  protected readonly brandDevices = computed(
    () => this.brands().find((b) => b.id === this.formBrandId())?.devices ?? [],
  );

  protected readonly pickedDevice = computed<CatalogDevice | null>(
    () => this.brandDevices().find((d) => d.id === this.formDeviceId()) ?? null,
  );

  /** Colleagues this sale's accessories can be split with: everyone in the area except the rep. */
  protected readonly shareCandidates = computed(() => {
    const rep = this.formRepIdSig() ?? this.report()?.myId ?? null;
    return this.colleagues().filter((c) => c.id !== rep);
  });
  /** Mirror of formRepId for computed(); updated from the rep select. */
  protected readonly formRepIdSig = signal<number | null>(null);

  protected readonly myLines = computed(() => {
    const r = this.report();
    return r ? r.lines.filter((l) => l.repId === r.myId) : [];
  });

  ngOnInit(): void {
    this.api.eodCategories().subscribe((c) => this.categories.set(c));
    this.api.brands().subscribe((b) => this.brands.set(b));
    if (this.auth.isEmployee()) {
      this.loadToday();
      return;
    }
    this.mode.set('day');
    this.api.areas().subscribe((list) => {
      const active = list.filter((a) => a.active);
      this.areas.set(active);
      const mine = this.auth.user()?.areaId ?? null;
      this.selectArea(mine ?? active[0]?.id ?? null);
    });
  }

  // ---------- Loading ----------

  private loadToday(): void {
    this.loading.set(true);
    this.api.eodToday().subscribe({
      next: (t) => {
        this.stores.set(t.stores);
        this.storeId.set(t.storeId);
        this.todayStoreId.set(t.storeId);
        this.todayReason.set(t.reason);
        this.date.set(t.date);
        this.setReport(t.report);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected selectArea(id: number | null): void {
    this.areaId.set(id);
    if (id == null) {
      this.loading.set(false);
      return;
    }
    this.api.stores(id).subscribe((list) =>
      this.stores.set(list.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name, label: s.label }))),
    );
    this.refresh();
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.refresh();
  }

  protected refresh(): void {
    const mode = this.mode();
    if (mode === 'report') {
      this.loadReport();
    } else if (mode === 'day') {
      this.loading.set(true);
      this.api.eodDay(this.areaId(), this.date()).subscribe({
        next: (d) => {
          this.dayOverview.set(d);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    } else {
      this.loading.set(true);
      this.api.eodMonth(this.areaId(), this.month()).subscribe({
        next: (m) => {
          this.monthSummary.set(m);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    }
  }

  protected loadReport(): void {
    const storeId = this.storeId();
    if (storeId == null) {
      this.setReport(null);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.eodReport(storeId, this.date()).subscribe({
      next: (r) => {
        this.setReport(r);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Opens one store's day from the overview. */
  protected openStore(storeId: number, date: string = this.date()): void {
    this.storeId.set(storeId);
    this.date.set(date);
    this.mode.set('report');
    this.loadReport();
  }

  protected selectStore(id: number | null): void {
    this.storeId.set(id);
    this.loadReport();
  }

  protected selectDate(date: string): void {
    if (!date) {
      return;
    }
    this.date.set(date > this.todayIso ? this.todayIso : date);
    this.refresh();
  }

  protected selectMonth(month: string): void {
    if (month) {
      this.month.set(month);
      this.refresh();
    }
  }

  private setReport(r: EodReport | null): void {
    const previous = this.report();
    this.report.set(r);
    if (r && (previous?.storeId !== r.storeId || previous?.date !== r.date)) {
      this.api.eodColleagues(r.storeId, r.date).subscribe((list) => this.colleagues.set(list));
    }
    this.loadSplit(r);
    const sameDay = !!r && previous?.storeId === r.storeId && previous?.date === r.date;
    if (sameDay && this.closingDirty && r.status === 'OPEN') {
      this.closingTick.update((n) => n + 1);
      return;
    }
    this.closingDirty = false;
    this.closing = r
      ? {
          qpayTotal: r.qpayTotal,
          cash: r.cash,
          credit: r.credit,
          finance: r.finance,
          layawayRedeem: r.layawayRedeem,
          newLayaway: r.newLayaway,
          note: r.note,
        }
      : this.emptyClosing();
    this.closingTick.update((n) => n + 1);
  }

  private emptyClosing(): Omit<EodClosingRequest, 'storeId' | 'date'> {
    return { qpayTotal: null, cash: null, credit: null, finance: null, layawayRedeem: null, newLayaway: null, note: null };
  }

  protected closingChanged(): void {
    this.closingDirty = true;
    this.closingTick.update((n) => n + 1);
  }

  /** Anything typed in the money counted or the note. */
  protected hasClosing(): boolean {
    this.closingTick();
    return Object.values(this.closing).some((v) => v !== null && v !== undefined && String(v).trim() !== '');
  }

  /** Empties the money counted and the note (saved straight away), e.g. after a manager reopens the day. */
  protected async clearClosing(): Promise<void> {
    const r = this.report();
    if (!r) {
      return;
    }
    const ok = await this.confirm.ask({
      title: 'Clear the money counted?',
      message: 'Qpay report, cash, card, finance, layaway and the note are emptied so you can count again. Sales stay as they are.',
      icon: 'bi-arrow-counterclockwise',
      tone: 'warning',
      confirmText: 'Clear',
    });
    if (ok) {
      this.closing = this.emptyClosing();
      this.closingDirty = false;
      this.closingTick.update((n) => n + 1);
      this.run(this.api.saveEodClosing({ storeId: r.storeId, date: r.date, ...this.emptyClosing() }), 'Money counted cleared.');
    }
  }

  // ---------- Sales ----------

  /** The drop came out over: log the difference as accessories (pick who; share it with a partner if needed). */
  protected addOverAsAccessories(): void {
    const over = this.live().overShort;
    this.openSale('ACCESSORY');
    this.formSoldFor = over > 0 ? over : null;
    this.formDescription = '';
  }

  protected openSale(type: EodLineType): void {
    this.editingId.set(null);
    this.formType = type;
    this.formCategory.set(null);
    this.formDescription = '';
    this.formQpay = null;
    this.formSubtotal = null;
    this.formSoldFor = null;
    this.formCustomer = '';
    this.formImei = '';
    this.formPhone = '';
    this.formRepId = null;
    this.formRepIdSig.set(null);
    this.formBrandId.set(null);
    this.formDeviceId.set(null);
    this.formShare.set([]);
    this.soldForTyped = false;
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected editLine(l: EodLine): void {
    this.editingId.set(l.id);
    this.formType = l.type;
    this.formCategory.set(l.category);
    this.formDescription = l.type === 'SALE' ? l.description : l.description === 'All accessories' ? '' : l.description;
    this.formQpay = l.type === 'SALE' ? l.qpay : null;
    this.formSubtotal = l.type === 'SALE' ? l.subtotal : null;
    this.formSoldFor = l.soldFor;
    this.formCustomer = l.customerRef === 'Walk in' ? '' : (l.customerRef ?? '');
    this.formImei = l.imeiLast4 ?? '';
    this.formPhone = l.phone ?? '';
    this.formRepId = l.repId === this.report()?.myId ? null : l.repId;
    this.formRepIdSig.set(l.repId);
    const device = this.brands().flatMap((b) => b.devices).find((d) => d.id === l.deviceId) ?? null;
    this.formBrandId.set(device?.brandId ?? null);
    this.formDeviceId.set(device?.id ?? null);
    if (device) {
      this.formDescription = '';
    }
    this.formShare.set(l.sharedWith.map((p) => p.id));
    this.soldForTyped = true;
    this.formError.set(null);
    this.formOpen.set(true);
  }

  /** For a phone/service sale, "Sold for" follows QPAY + subtotal until the rep types it (accessories on top). */
  protected suggestSoldFor(): void {
    if (this.formType === 'SALE' && !this.soldForTyped) {
      const sum = cents(this.formQpay) + cents(this.formSubtotal);
      this.formSoldFor = this.formQpay == null && this.formSubtotal == null ? null : dollars(sum);
    }
  }

  protected soldForChanged(): void {
    this.soldForTyped = true;
  }

  protected pickBrand(id: number | null): void {
    this.formBrandId.set(id);
    this.formDeviceId.set(null);
  }

  /** Picking a device names the sale; the subtotal is still typed from the receipt. */
  protected pickDevice(id: number | null): void {
    this.formDeviceId.set(id);
    if (this.pickedDevice()) {
      this.formDescription = '';
    }
  }

  protected pickRep(id: number | null): void {
    this.formRepId = id;
    this.formRepIdSig.set(id);
    this.formShare.update((list) => list.filter((x) => x !== id));
  }

  protected toggleShare(id: number): void {
    this.formShare.update((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : list.length >= 3 ? list : [...list, id],
    );
  }

  /** The accessories on the sale being typed (for an accessory sale, the whole amount). */
  protected formAccessoryAmount(): number {
    return this.formType === 'ACCESSORY' ? dollars(cents(this.formSoldFor)) : this.formAccessories();
  }

  /** e.g. "$5.96 each" for the split being set up on this sale. */
  protected shareNote(): string {
    const n = this.formShare().length + 1;
    const each = dollars(Math.floor(cents(this.formAccessoryAmount()) / n));
    return `about $${each.toFixed(2)} each`;
  }

  /** Name of whoever gets the box on the sale being typed. */
  protected formRepName(): string {
    const id = this.formRepIdSig();
    return id == null ? 'you' : (this.colleagues().find((c) => c.id === id)?.name ?? 'the rep');
  }

  // ---------- Steps ----------

  /** Where the day is: 1 sales, 2 closing out, 3 submitted, 4 approved. */
  protected readonly step = computed(() => {
    const r = this.report();
    if (!r) {
      return 1;
    }
    if (r.status === 'APPROVED') {
      return 4;
    }
    if (r.status === 'SUBMITTED') {
      return 3;
    }
    return this.live().started ? 2 : 1;
  });

  protected readonly steps = ['Sales', 'Close out', 'Submitted', 'Approved'];

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
  }

  // ---------- Splitting the day's accessories ----------

  /** seller = each accessory to whoever sold it; even = split evenly; custom = amounts typed in. */
  protected readonly splitMode = signal<'seller' | 'even' | 'custom'>('seller');
  /** Who takes part in an even or custom split. */
  protected readonly splitPeople = signal<number[]>([]);
  protected splitAmounts: Record<number, number | null> = {};
  protected readonly splitTick = signal(0);
  protected readonly splitOpen = signal(false);

  /** Who can be in the split: the day's team, then anyone added. */
  protected readonly splitCandidates = computed(() => {
    const r = this.report();
    const seen = new Set<number>();
    const list: { id: number; name: string; scheduled: boolean }[] = [];
    for (const t of r?.team ?? []) {
      seen.add(t.id);
      list.push({ id: t.id, name: t.name, scheduled: t.scheduled });
    }
    for (const id of this.splitPeople()) {
      if (!seen.has(id)) {
        const c = this.colleagues().find((x) => x.id === id);
        if (c) {
          list.push({ id: c.id, name: c.name, scheduled: c.scheduledHere });
        }
      }
    }
    return list;
  });

  protected readonly splitAddable = computed(() => {
    const inList = new Set(this.splitCandidates().map((c) => c.id));
    return this.colleagues().filter((c) => !inList.has(c.id));
  });

  /** Even split in cents; the first person takes any leftover cent (like the server). */
  protected readonly evenSplit = computed(() => {
    const people = this.splitPeople();
    const total = cents(this.report()?.totals.accessories);
    const result = new Map<number, number>();
    if (people.length === 0) {
      return result;
    }
    const part = Math.floor(total / people.length);
    people.forEach((id, i) => result.set(id, dollars(i === 0 ? total - part * (people.length - 1) : part)));
    return result;
  });

  protected readonly splitSum = computed(() => {
    this.splitTick();
    if (this.splitMode() === 'even') {
      return dollars([...this.evenSplit().values()].reduce((n, v) => n + cents(v), 0));
    }
    return dollars(this.splitPeople().reduce((n, id) => n + cents(this.splitAmounts[id]), 0));
  });

  protected readonly splitLeft = computed(() => dollars(cents(this.report()?.totals.accessories) - cents(this.splitSum())));

  private loadSplit(r: EodReport | null): void {
    const saved = r?.accessorySplit ?? [];
    if (saved.length === 0) {
      this.splitMode.set('seller');
      this.splitPeople.set((r?.team ?? []).filter((t) => t.scheduled).map((t) => t.id));
      this.splitAmounts = {};
    } else {
      this.splitMode.set('custom');
      this.splitPeople.set(saved.map((x) => x.employeeId));
      this.splitAmounts = Object.fromEntries(saved.map((x) => [x.employeeId, x.amount]));
    }
    this.splitTick.update((n) => n + 1);
  }

  protected setSplitMode(mode: 'seller' | 'even' | 'custom'): void {
    if (mode !== 'seller' && this.splitPeople().length === 0) {
      this.splitPeople.set((this.report()?.team ?? []).map((t) => t.id));
    }
    if (mode === 'custom' && this.splitMode() === 'even') {
      this.splitAmounts = Object.fromEntries(this.evenSplit());
    }
    this.splitMode.set(mode);
    this.splitTick.update((n) => n + 1);
  }

  protected toggleSplitPerson(id: number): void {
    this.splitPeople.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
    this.splitTick.update((n) => n + 1);
  }

  protected addSplitPerson(id: number | null): void {
    if (id != null && !this.splitPeople().includes(id)) {
      this.splitPeople.update((list) => [...list, id]);
      this.splitTick.update((n) => n + 1);
    }
  }

  protected splitChanged(): void {
    this.splitTick.update((n) => n + 1);
  }

  protected saveSplit(): void {
    const r = this.report();
    if (!r) {
      return;
    }
    const mode = this.splitMode();
    let shares: { employeeId: number; amount: number }[] = [];
    if (mode === 'even') {
      shares = [...this.evenSplit()].map(([employeeId, amount]) => ({ employeeId, amount }));
    } else if (mode === 'custom') {
      shares = this.splitPeople()
        .map((id) => ({ employeeId: id, amount: dollars(cents(this.splitAmounts[id])) }))
        .filter((s) => s.amount > 0);
    }
    if (mode !== 'seller' && this.splitLeft() !== 0) {
      this.toast.error(`The split is $${Math.abs(this.splitLeft()).toFixed(2)} ${this.splitLeft() > 0 ? 'short of' : 'over'} the day's accessories.`);
      return;
    }
    this.run(
      this.api.saveEodSplit(r.storeId, r.date, shares),
      mode === 'seller' ? 'Accessories go to whoever sold them.' : 'Accessory split saved.',
      () => this.splitOpen.set(false),
    );
  }

  /** Checks on the device so the rep fixes mistakes before saving. */
  private formProblem(): string | null {
    if (this.formType === 'ACCESSORY') {
      return cents(this.formSoldFor) > 0 ? null : 'Enter the accessory amount.';
    }
    if (!this.formCategory()) {
      return 'Pick the category. Commission is counted by it.';
    }
    if (!this.pickedDevice() && !this.formDescription.trim()) {
      return 'Pick the device from the list, or choose Other and type it (e.g. BYOD).';
    }
    if (this.formSubtotal == null || String(this.formSubtotal) === '') {
      return 'Enter the subtotal from the receipt (0 if there isn’t one).';
    }
    if (this.formSoldFor == null) {
      return 'Enter what the customer paid (Sold for).';
    }
    if (this.formAccessories() < 0) {
      return 'Sold for can’t be less than QPAY + subtotal.';
    }
    if (this.needsDevice() && (!/^\d{4}$/.test(this.formImei.trim()) || !this.formPhone.trim())) {
      return 'Enter the last 4 of the IMEI and the phone number.';
    }
    if (this.auth.isAdmin() && this.formRepId == null) {
      return 'Pick the rep who made the sale.';
    }
    return null;
  }

  protected saveLine(): void {
    const r = this.report();
    const problem = this.formProblem();
    if (!r || problem) {
      this.formError.set(problem);
      return;
    }
    const sale = this.formType === 'SALE';
    const body = {
      storeId: r.storeId,
      date: r.date,
      type: this.formType,
      category: sale ? this.formCategory() : null,
      description: sale && this.pickedDevice() ? null : this.formDescription.trim() || null,
      qpay: sale ? (this.formQpay ?? 0) : null,
      subtotal: sale ? (this.formSubtotal ?? 0) : null,
      soldFor: this.formSoldFor ?? 0,
      customerRef: this.formCustomer.trim() || null,
      imeiLast4: sale && this.needsDevice() ? this.formImei.trim() : null,
      phone: sale && this.needsDevice() ? this.formPhone.trim() : null,
      repId: this.formRepId,
      deviceId: sale ? (this.pickedDevice()?.id ?? null) : null,
      shareWith: this.formShare(),
    };
    const id = this.editingId();
    this.run(id ? this.api.updateEodLine(id, body) : this.api.addEodLine(body), id ? 'Sale updated.' : 'Sale added.', () =>
      this.formOpen.set(false),
    );
  }

  protected async removeLine(l: EodLine): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove this sale?',
      message: `${l.description} · ${l.categoryLabel} · $${l.soldFor.toFixed(2)} (${l.repName})`,
      icon: 'bi-trash',
      tone: 'danger',
      confirmText: 'Remove',
    });
    if (ok) {
      this.run(this.api.deleteEodLine(l.id), 'Sale removed.');
    }
  }

  // ---------- Closing ----------

  private closingBody(): EodClosingRequest | null {
    const r = this.report();
    return r ? { storeId: r.storeId, date: r.date, ...this.closing, note: this.closing.note?.trim() || null } : null;
  }

  protected saveClosing(): void {
    const body = this.closingBody();
    if (body) {
      this.closingDirty = false;
      this.run(this.api.saveEodClosing(body), 'Closing figures saved.');
    }
  }

  protected async submit(): Promise<void> {
    const body = this.closingBody();
    const r = this.report();
    if (!body || !r) {
      return;
    }
    const live = this.live();
    if (live.overShort !== 0 && !body.note) {
      this.toast.error(`The drop is ${live.overShort > 0 ? 'over' : 'short'} by $${Math.abs(live.overShort).toFixed(2)}. Add a note saying why.`);
      return;
    }
    const notes = [
      `Total sale $${live.sale.toFixed(2)} · total drop $${live.drop.toFixed(2)} · ${live.overShort === 0 ? 'balanced' : (live.overShort > 0 ? 'over' : 'short') + ' $' + Math.abs(live.overShort).toFixed(2)}.`,
      `${r.lines.length} sale${r.lines.length === 1 ? '' : 's'} logged (${live.boxes} box${live.boxes === 1 ? '' : 'es'}).`,
      'After submitting, sales can’t be changed unless a manager reopens it.',
    ];
    const ok = await this.confirm.ask({
      title: `Submit ${r.storeName}'s EOD?`,
      message: formatDay(r.date, { weekday: 'long', month: 'short', day: 'numeric' }),
      icon: 'bi-send-check',
      tone: live.overShort === 0 ? 'primary' : 'warning',
      notes,
      confirmText: 'Submit EOD',
    });
    if (ok) {
      this.closingDirty = false;
      this.run(this.api.submitEod(body), 'EOD submitted. Thanks!');
    }
  }

  protected approve(): void {
    const r = this.report();
    if (r?.id) {
      this.run(this.api.approveEod(r.id), 'EOD approved.');
    }
  }

  protected async reopen(): Promise<void> {
    const r = this.report();
    if (!r?.id) {
      return;
    }
    const ok = await this.confirm.ask({
      title: 'Reopen this EOD?',
      message: 'Reps can change sales and the closing figures again, and it has to be submitted again.',
      icon: 'bi-unlock',
      tone: 'warning',
      confirmText: 'Reopen',
    });
    if (ok) {
      this.run(this.api.reopenEod(r.id), 'EOD reopened.');
    }
  }

  private run(request: Observable<EodReport>, message: string, after?: () => void): void {
    this.busy.set(true);
    request.subscribe({
      next: (r) => {
        this.setReport(r);
        this.busy.set(false);
        this.toast.success(message);
        after?.();
      },
      error: () => this.busy.set(false),
    });
  }

  // ---------- Display helpers ----------

  protected statusClass(status: EodStatus | null): string {
    return status === 'APPROVED'
      ? 'text-bg-success'
      : status === 'SUBMITTED'
        ? 'text-bg-primary'
        : status === 'OPEN'
          ? 'text-bg-warning'
          : 'text-bg-light border';
  }

  protected overShortLabel(v: number): string {
    return v === 0 ? 'Balanced' : v > 0 ? 'Over' : 'Short';
  }

  protected abs(v: number): number {
    return Math.abs(v);
  }

  protected repCount(rep: { byCategory: { category: EodCategory; count: number }[] }, category: EodCategory): number {
    return rep.byCategory.find((c) => c.category === category)?.count ?? 0;
  }

  protected storeName(id: number | null): string {
    return this.stores().find((s) => s.id === id)?.name ?? '';
  }
}
