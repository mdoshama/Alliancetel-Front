import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { formatDay, today } from '../../core/date-utils';
import {
  AdjustmentType,
  AdjustmentTypeOption,
  Area,
  CommissionMonth,
  CommissionPlan,
  CommissionStatement,
  Employee,
} from '../../core/models';

type Tab = 'payouts' | 'adjustments' | 'plan';

/**
 * Commission (admins only). Payouts are worked out from approved EODs with the plan (the Sync Sphere sheet by
 * default), minus fines and plus rewards. Finalizing a month stores the payouts so they don't change afterwards.
 */
@Component({
  selector: 'app-commission-page',
  imports: [FormsModule, CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './commission-page.html',
})
export class CommissionPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly format = formatDay;
  protected readonly tab = signal<Tab>('payouts');
  protected readonly month = signal(today().slice(0, 7));
  protected readonly areas = signal<Area[]>([]);
  protected readonly areaId = signal<number | null>(null);
  protected readonly data = signal<CommissionMonth | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly expanded = signal<number | null>(null);
  protected readonly showEmpty = signal(false);

  /** People with nothing at all this month (no pay, no fines, nothing waiting) are folded away by default. */
  private isEmpty(s: CommissionStatement): boolean {
    return s.pay.total === 0 && s.pay.fines === 0 && s.pay.rewards === 0 && s.pendingBoxes === 0 && s.pendingAccessories === 0;
  }
  protected readonly visibleStatements = computed(() =>
    (this.data()?.statements ?? []).filter((s) => this.showEmpty() || !this.isEmpty(s)),
  );
  protected readonly emptyCount = computed(() => (this.data()?.statements ?? []).filter((s) => this.isEmpty(s)).length);

  // Fines & rewards
  protected readonly types = signal<AdjustmentTypeOption[]>([]);
  protected readonly staff = signal<Employee[]>([]);
  protected adjEmployeeId: number | null = null;
  protected adjDate = today();
  protected adjType: AdjustmentType = 'LATE';
  protected adjMinutes: number | null = 5;
  protected adjAmount: number | null = null;
  protected adjNote = '';

  // Plan
  protected plan: CommissionPlan | null = null;
  protected readonly planSaving = signal(false);

  protected readonly allAdjustments = computed(() =>
    (this.data()?.statements ?? [])
      .flatMap((s) => s.adjustments)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
  );

  protected readonly selectedType = computed(() => this.types().find((t) => t.value === this.adjTypeSig()) ?? null);
  protected readonly adjTypeSig = signal<AdjustmentType>('LATE');

  ngOnInit(): void {
    this.api.areas().subscribe((list) => this.areas.set(list.filter((a) => a.active)));
    this.api.adjustmentTypes().subscribe((t) => this.types.set(t));
    this.api.employees({ active: true }).subscribe((list) => this.staff.set(list.filter((e) => e.role !== 'ADMIN')));
    this.api.commissionPlan().subscribe((p) => (this.plan = p));
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.commissionMonth(this.month(), this.areaId()).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected selectMonth(m: string): void {
    if (m) {
      this.month.set(m);
      this.expanded.set(null);
      this.load();
    }
  }

  protected selectArea(id: number | null): void {
    this.areaId.set(id);
    this.load();
  }

  protected monthLabel(): string {
    return formatDay(this.month() + '-01', { month: 'long', year: 'numeric' });
  }

  protected toggle(s: CommissionStatement): void {
    this.expanded.set(this.expanded() === s.employeeId ? null : s.employeeId);
  }

  // ---------- Finalize ----------

  protected async finalizeMonth(): Promise<void> {
    const d = this.data();
    if (!d) {
      return;
    }
    const notes = [...d.warnings];
    const ok = await this.confirm.ask({
      title: `Finalize ${this.monthLabel()}?`,
      message: `Payouts are saved as they are now (${d.totals.people} people, all areas). Later changes to EODs, fines or the plan won't change them unless you reopen the month.`,
      icon: 'bi-lock',
      tone: notes.length ? 'warning' : 'primary',
      notes,
      confirmText: 'Finalize month',
    });
    if (ok) {
      this.busy.set(true);
      this.api.finalizeCommission(this.month()).subscribe({
        next: () => {
          this.busy.set(false);
          this.toast.success(`${this.monthLabel()} finalized.`);
          this.load();
        },
        error: () => this.busy.set(false),
      });
    }
  }

  protected async reopenMonth(): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Reopen ${this.monthLabel()}?`,
      message: 'The saved payouts are removed and worked out again from the current EODs, fines and plan.',
      icon: 'bi-unlock',
      tone: 'warning',
      confirmText: 'Reopen month',
    });
    if (ok) {
      this.busy.set(true);
      this.api.reopenCommission(this.month()).subscribe({
        next: () => {
          this.busy.set(false);
          this.toast.success(`${this.monthLabel()} reopened.`);
          this.load();
        },
        error: () => this.busy.set(false),
      });
    }
  }

  // ---------- Fines & rewards ----------

  protected pickType(t: AdjustmentType): void {
    this.adjType = t;
    this.adjTypeSig.set(t);
    this.adjAmount = null;
  }

  /** What this fine or reward will be, before saving. */
  protected adjPreview(): number {
    const t = this.selectedType();
    if (!t) {
      return 0;
    }
    if (this.adjAmount != null) {
      return this.adjAmount;
    }
    return t.defaultAmount * (t.perMinute ? (this.adjMinutes ?? 0) : 1);
  }

  protected saveAdjustment(): void {
    const t = this.selectedType();
    if (this.adjEmployeeId == null || !t) {
      this.toast.error('Pick the employee.');
      return;
    }
    if (t.perMinute && !this.adjMinutes) {
      this.toast.error('Enter how many minutes late.');
      return;
    }
    if ((t.value === 'OTHER_FINE' || t.value === 'OTHER_BONUS') && !this.adjAmount) {
      this.toast.error('Enter the amount.');
      return;
    }
    this.busy.set(true);
    this.api
      .addAdjustment({
        employeeId: this.adjEmployeeId,
        date: this.adjDate,
        type: t.value,
        quantity: t.perMinute ? this.adjMinutes : null,
        amount: this.adjAmount,
        note: this.adjNote.trim() || null,
      })
      .subscribe({
        next: (a) => {
          this.busy.set(false);
          this.toast.success(`${a.typeLabel} recorded for ${a.employeeName}.`);
          this.adjNote = '';
          this.adjAmount = null;
          if (a.date.slice(0, 7) !== this.month()) {
            this.month.set(a.date.slice(0, 7));
          }
          this.load();
        },
        error: () => this.busy.set(false),
      });
  }

  protected async removeAdjustment(id: number, label: string, name: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Remove this ${label.toLowerCase()}?`,
      message: `${name}'s commission is worked out again without it.`,
      icon: 'bi-trash',
      tone: 'danger',
      confirmText: 'Remove',
    });
    if (ok) {
      this.api.deleteAdjustment(id).subscribe(() => {
        this.toast.success('Removed.');
        this.load();
      });
    }
  }

  // ---------- Plan ----------

  protected savePlan(): void {
    if (!this.plan) {
      return;
    }
    this.planSaving.set(true);
    this.api.updateCommissionPlan(this.plan).subscribe({
      next: (p) => {
        this.plan = p;
        this.planSaving.set(false);
        this.toast.success('Plan saved. Open months use it right away; finalized months keep their payouts.');
        this.load();
      },
      error: () => this.planSaving.set(false),
    });
  }

  // ---------- Export ----------

  /** Payouts as a CSV for payroll. */
  protected exportCsv(): void {
    const d = this.data();
    if (!d) {
      return;
    }
    const head = [
      'Employee', 'Code', 'Area', 'Activations', 'Activation rate', 'Activation pay', 'Upgrades', 'Upgrade rate',
      'Upgrade pay', 'BTS', 'BTS pay', 'Home internet', 'Home internet pay', 'Unlock', 'Unlock pay', 'Metro locked',
      'Metro locked pay', 'Accessories (gross)', 'Accessories (net)', 'Accessory %', 'Accessory pay', 'Fines',
      'Rewards', 'Total',
    ];
    const rows = d.statements.map((s) => {
      const p = s.pay;
      return [
        s.name, s.employeeCode, s.areaName ?? '', p.activations, p.activationRate, p.activationPay, p.upgrades,
        p.upgradeRate, p.upgradePay, p.bts, p.btsPay, p.homeInternet, p.homeInternetPay, p.unlock, p.unlockPay,
        p.metroLocked, p.metroLockedPay, p.accessoriesGross, p.accessoriesNet, p.accessoryPercent, p.accessoryPay,
        p.fines, p.rewards, p.total,
      ];
    });
    const csv = [head, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `AllianceTel-commission-${this.month()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
