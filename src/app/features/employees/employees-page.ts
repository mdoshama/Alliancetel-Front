import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Area, Credentials, Employee, ROLE_LABELS, Role, Store, STORE_ROLE_HELP, STORE_ROLE_LABELS } from '../../core/models';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';

@Component({
  selector: 'app-employees-page',
  imports: [ReactiveFormsModule, FormsModule, Modal, DatePipe],
  templateUrl: './employees-page.html',
})
export class EmployeesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);

  /** Optional ?area= query param, e.g. when arriving from the Areas page. */
  readonly area = input<string>();
  /** Optional ?store= query param, e.g. when arriving from the Stores page. */
  readonly store = input<string>();

  protected readonly roles: Role[] = ['ADMIN', 'MANAGER', 'EMPLOYEE'];
  protected readonly roleLabels = ROLE_LABELS;

  protected readonly areas = signal<Area[]>([]);
  protected readonly stores = signal<Store[]>([]);
  /** Client-side filter on home store (null = all). */
  protected readonly storeFilter = signal<number | null>(null);
  /** Employee id whose home store is being saved, for a spinner on that row. */
  protected readonly movingId = signal<number | null>(null);
  protected readonly employees = signal<Employee[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<Employee | null>(null);
  /** One-time temporary password shown after creating an account or resetting it. */
  protected readonly issued = signal<Credentials | null>(null);
  protected readonly copied = signal(false);

  // Filters
  protected areaFilter: number | null = null;
  protected roleFilter: Role | null = null;
  protected statusFilter: 'active' | 'inactive' | 'all' = 'active';
  protected search = '';

  /** Stores to offer in the filter: the selected area's, or all the user can see. */
  protected readonly filterStores = computed(() => {
    const area = this.areaFilterSignal();
    return this.stores().filter((s) => area == null || s.areaId === area);
  });

  protected readonly visible = computed(() => {
    const store = this.storeFilter();
    return store == null ? this.employees() : this.employees().filter((e) => e.homeStoreId === store);
  });

  /** Mirrors areaFilter so computed values can react to it. */
  private readonly areaFilterSignal = signal<number | null>(null);

  protected readonly counts = computed(() => {
    const list = this.visible();
    return {
      total: list.length,
      managers: list.filter((e) => e.role === 'MANAGER').length,
    };
  });

  protected readonly storeRoleLabels = STORE_ROLE_LABELS;
  protected readonly storeRoleHelp = STORE_ROLE_HELP;

  protected readonly form = this.fb.nonNullable.group({
    employeeCode: ['', [Validators.required, Validators.maxLength(20)]],
    firstName: ['', [Validators.required, Validators.maxLength(60)]],
    lastName: ['', [Validators.required, Validators.maxLength(60)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(120)]],
    phone: ['', Validators.maxLength(30)],
    role: ['EMPLOYEE' as Role, Validators.required],
    areaId: [null as number | null],
    homeStoreId: [null as number | null],
    primaryAtStore: [false],
    workDaysPerWeek: [6, [Validators.required, Validators.min(1), Validators.max(7)]],
    active: [true],
  });

  private searchTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    const fromQuery = Number(this.area());
    this.areaFilter = Number.isFinite(fromQuery) && fromQuery > 0 ? fromQuery : null;
    this.areaFilterSignal.set(this.areaFilter);
    const storeFromQuery = Number(this.store());
    this.storeFilter.set(Number.isFinite(storeFromQuery) && storeFromQuery > 0 ? storeFromQuery : null);
    this.api.areas().subscribe((list) => this.areas.set(list));
    this.api.stores().subscribe((list) => this.stores.set(list));
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api
      .employees({
        areaId: this.areaFilter,
        role: this.roleFilter,
        active: this.statusFilter === 'all' ? null : this.statusFilter === 'active',
        q: this.search.trim() || null,
      })
      .subscribe({
        next: (list) => {
          this.employees.set(list);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  protected onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 300);
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.form.reset({
      employeeCode: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      role: 'EMPLOYEE',
      areaId: this.areaFilter,
      homeStoreId: null,
      primaryAtStore: false,
      workDaysPerWeek: 6,
      active: true,
    });
    this.modalOpen.set(true);
  }

  protected openEdit(e: Employee): void {
    this.editing.set(e);
    this.form.reset({
      employeeCode: e.employeeCode,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      phone: e.phone ?? '',
      role: e.role,
      areaId: e.areaId,
      homeStoreId: e.homeStoreId,
      primaryAtStore: e.storeRole === 'PRIMARY',
      workDaysPerWeek: e.workDaysPerWeek,
      active: e.active,
    });
    this.modalOpen.set(true);
  }

  protected areaRequired(): boolean {
    return this.form.controls.role.value !== 'ADMIN';
  }

  protected save(): void {
    const v = this.form.getRawValue();
    if (this.form.invalid || (this.areaRequired() && v.areaId == null)) {
      this.form.markAllAsTouched();
      return;
    }
    const body = {
      ...v,
      phone: v.phone.trim() || null,
      areaId: v.areaId == null ? null : Number(v.areaId),
      homeStoreId: v.homeStoreId == null ? null : Number(v.homeStoreId),
      primaryAtStore: v.homeStoreId != null && v.primaryAtStore,
      workDaysPerWeek: Number(v.workDaysPerWeek),
    };
    const current = this.editing();
    const request: Observable<Employee | Credentials> = current
      ? this.api.updateEmployee(current.id, body)
      : this.api.createEmployee(body);
    this.saving.set(true);
    request.subscribe({
      next: (result) => {
        this.saving.set(false);
        this.modalOpen.set(false);
        if ('temporaryPassword' in result) {
          this.showCredentials(result);
        } else {
          this.toast.success(`${result.fullName} updated.`);
        }
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  /** Active stores in an area, for the home-store pickers. */
  protected storesIn(areaId: number | null): Store[] {
    return this.stores().filter((s) => s.areaId === areaId && s.active);
  }

  protected onAreaFilterChange(): void {
    this.areaFilterSignal.set(this.areaFilter);
    this.storeFilter.set(null);
    this.load();
  }

  /** The form's store list follows the chosen area; a store from another area is cleared. */
  protected onFormAreaChange(): void {
    const v = this.form.getRawValue();
    if (v.homeStoreId != null && !this.storesIn(v.areaId).some((s) => s.id === v.homeStoreId)) {
      this.form.controls.homeStoreId.setValue(null);
    }
  }

  /** The store's color, for the role chip. */
  protected storeColor(storeId: number | null): string | null {
    return storeId == null ? null : (this.stores().find((x) => x.id === storeId)?.color ?? null);
  }

  /** Switches someone between primary and secondary at their home store, from the list. */
  protected setPrimary(e: Employee, primary: boolean): void {
    if (primary === (e.storeRole === 'PRIMARY')) {
      return;
    }
    this.movingId.set(e.id);
    this.api.changeHomeStore(e.id, e.homeStoreId, primary).subscribe({
      next: (updated) => {
        this.movingId.set(null);
        this.employees.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
        this.toast.success(
          primary
            ? `${updated.firstName} is now the primary at ${updated.homeStoreName}. Auto-fill will keep them there.`
            : `${updated.firstName} is now a secondary at ${updated.homeStoreName}.`,
        );
      },
      error: () => {
        this.movingId.set(null);
        this.employees.update((list) => [...list]);
      },
    });
  }

  /** Quick rotation from the list: move someone to another store in their area. */
  protected moveToStore(e: Employee, storeId: number | null): void {
    if (storeId === e.homeStoreId) {
      return;
    }
    this.movingId.set(e.id);
    this.api.changeHomeStore(e.id, storeId).subscribe({
      next: (updated) => {
        this.movingId.set(null);
        this.employees.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
        this.toast.success(
          updated.homeStoreName
            ? `${updated.fullName} now works at ${updated.homeStoreName}.`
            : `${updated.fullName} has no home store.`,
        );
        this.api.stores().subscribe((list) => this.stores.set(list));
      },
      error: () => {
        this.movingId.set(null);
        // Re-render the select with the unchanged value.
        this.employees.update((list) => [...list]);
      },
    });
  }

  protected async resetPassword(e: Employee): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Reset password?',
      message: `${e.fullName} will get a new temporary password and must choose their own at next sign-in.`,
      icon: 'bi-key',
      tone: 'warning',
      notes: ['Their current password stops working immediately.'],
      confirmText: 'Reset password',
    });
    if (!ok) {
      return;
    }
    this.api.resetPassword(e.id).subscribe((credentials) => {
      this.showCredentials(credentials);
      this.load();
    });
  }

  protected copyPassword(): void {
    const password = this.issued()?.temporaryPassword;
    if (!password) {
      return;
    }
    navigator.clipboard?.writeText(password).then(
      () => this.copied.set(true),
      () => this.copied.set(false),
    );
  }

  private showCredentials(credentials: Credentials): void {
    this.copied.set(false);
    this.issued.set(credentials);
  }

  protected async deactivate(e: Employee): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Deactivate ${e.fullName}?`,
      message: 'They will be signed out, can no longer sign in, and won\'t appear on new schedules.',
      icon: 'bi-person-dash',
      tone: 'danger',
      notes: ['Past schedules keep their history. You can reactivate them later from Edit.'],
      confirmText: 'Deactivate',
    });
    if (!ok) {
      return;
    }
    this.api.deactivateEmployee(e.id).subscribe(() => {
      this.toast.success(`${e.fullName} deactivated.`);
      this.load();
    });
  }
}
