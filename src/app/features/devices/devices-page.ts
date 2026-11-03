import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { CatalogBrand, CatalogDevice } from '../../core/models';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { matchesSearch } from '../../core/paging';
import { Modal } from '../../shared/modal';

/**
 * The device list (admins only): brands, their devices and retail prices. Reps pick from it when they log a sale on
 * the End of Day page, so they never type a device or its price.
 */
@Component({
  selector: 'app-devices-page',
  imports: [FormsModule, CurrencyPipe, Modal],
  templateUrl: './devices-page.html',
})
export class DevicesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly brands = signal<CatalogBrand[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly search = signal('');
  /** null = all brands */
  protected readonly brandFilter = signal<number | null>(null);

  /** Brands (and devices) matching the filter and search. */
  protected readonly view = computed(() => {
    const q = this.search();
    const only = this.brandFilter();
    return this.brands()
      .filter((b) => only == null || b.id === only)
      .map((b) => ({
        brand: b,
        devices: matchesSearch(q, b.name) ? b.devices : b.devices.filter((d) => matchesSearch(q, d.name, d.displayName)),
      }))
      .filter((x) => !q.trim() || x.devices.length > 0 || matchesSearch(q, x.brand.name));
  });

  protected readonly deviceCount = computed(() => this.brands().reduce((n, b) => n + b.devices.length, 0));

  // Brand modal
  protected readonly brandOpen = signal(false);
  protected readonly editingBrand = signal<CatalogBrand | null>(null);
  protected brandName = '';
  protected brandActive = true;

  // Device modal
  protected readonly deviceOpen = signal(false);
  protected readonly editingDevice = signal<CatalogDevice | null>(null);
  protected deviceBrandId: number | null = null;
  protected deviceName = '';
  protected devicePrice: number | null = null;
  protected deviceActive = true;
  /** Keep the modal open to add several devices in a row. */
  protected addAnother = false;

  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.brands().subscribe({
      next: (list) => {
        this.brands.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  // ---------- Brands ----------

  protected openBrand(brand: CatalogBrand | null = null): void {
    this.editingBrand.set(brand);
    this.brandName = brand?.name ?? '';
    this.brandActive = brand?.active ?? true;
    this.error.set(null);
    this.brandOpen.set(true);
  }

  protected saveBrand(): void {
    const name = this.brandName.trim();
    if (!name) {
      this.error.set('Enter the brand name.');
      return;
    }
    const editing = this.editingBrand();
    const body = { name, active: this.brandActive };
    this.saving.set(true);
    (editing ? this.api.updateBrand(editing.id, body) : this.api.createBrand(body)).subscribe({
      next: (b) => {
        this.saving.set(false);
        this.brandOpen.set(false);
        this.toast.success(editing ? 'Brand updated.' : `${b.name} added. Now add its devices.`);
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  protected async deleteBrand(brand: CatalogBrand): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Remove ${brand.name}?`,
      message: `${brand.name} and its ${brand.devices.length} device(s) come off the list. Sales already logged keep their device and price.`,
      icon: 'bi-trash',
      tone: 'danger',
      notes: ['To stop selling it for now, edit it and turn off "Show to reps" instead.'],
      confirmText: 'Remove brand',
    });
    if (ok) {
      this.api.deleteBrand(brand.id).subscribe(() => {
        this.toast.success(`${brand.name} removed.`);
        this.load();
      });
    }
  }

  // ---------- Devices ----------

  protected openDevice(brandId: number | null, device: CatalogDevice | null = null): void {
    this.editingDevice.set(device);
    this.deviceBrandId = device?.brandId ?? brandId ?? this.brands()[0]?.id ?? null;
    this.deviceName = device?.name ?? '';
    this.devicePrice = device?.retailPrice ?? null;
    this.deviceActive = device?.active ?? true;
    this.error.set(null);
    this.deviceOpen.set(true);
  }

  protected saveDevice(): void {
    const name = this.deviceName.trim();
    if (this.deviceBrandId == null) {
      this.error.set('Pick the brand.');
      return;
    }
    if (!name) {
      this.error.set('Enter the device name, e.g. Galaxy A16.');
      return;
    }
    if (this.devicePrice == null || this.devicePrice < 0) {
      this.error.set('Enter the retail price.');
      return;
    }
    const editing = this.editingDevice();
    const body = { brandId: this.deviceBrandId, name, retailPrice: this.devicePrice, active: this.deviceActive };
    this.saving.set(true);
    (editing ? this.api.updateDevice(editing.id, body) : this.api.createDevice(body)).subscribe({
      next: (d) => {
        this.saving.set(false);
        this.toast.success(editing ? `${d.displayName} updated.` : `${d.displayName} added.`);
        if (!editing && this.addAnother) {
          this.deviceName = '';
          this.devicePrice = null;
        } else {
          this.deviceOpen.set(false);
        }
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  /** Shows or hides a device for reps without opening the editor. */
  protected toggleDevice(d: CatalogDevice): void {
    this.api
      .updateDevice(d.id, { brandId: d.brandId, name: d.name, retailPrice: d.retailPrice, active: !d.active })
      .subscribe(() => {
        this.toast.success(d.active ? `${d.displayName} hidden from reps.` : `${d.displayName} shown to reps.`);
        this.load();
      });
  }

  protected async deleteDevice(d: CatalogDevice): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Remove ${d.displayName}?`,
      message: 'It comes off the list. Sales already logged keep it.',
      icon: 'bi-trash',
      tone: 'danger',
      confirmText: 'Remove',
    });
    if (ok) {
      this.api.deleteDevice(d.id).subscribe(() => {
        this.toast.success(`${d.displayName} removed.`);
        this.load();
      });
    }
  }
}
