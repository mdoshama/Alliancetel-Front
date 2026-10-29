import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Area } from '../../core/models';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';
import { Pagination } from '../../shared/pagination';
import { matchesSearch, savePageSize, savedPageSize, slicePage } from '../../core/paging';

@Component({
  selector: 'app-areas-page',
  imports: [ReactiveFormsModule, FormsModule, RouterLink, Modal, Pagination],
  templateUrl: './areas-page.html',
})
export class AreasPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmService);

  protected readonly areas = signal<Area[]>([]);
  protected readonly loading = signal(true);
  protected readonly search = signal('');
  protected readonly page = signal(0);
  protected readonly pageSize = signal(savedPageSize());
  /** Areas matching the search, one page at a time (the list is small, so this runs in the browser). */
  protected readonly matching = computed(() =>
    this.areas().filter((a) => matchesSearch(this.search(), a.name, a.description)),
  );
  protected readonly view = computed(() => slicePage(this.matching(), this.page(), this.pageSize()));

  protected onSearch(text: string): void {
    this.search.set(text);
    this.page.set(0);
  }

  protected changePageSize(size: number): void {
    savePageSize(size);
    this.pageSize.set(size);
    this.page.set(0);
  }
  protected readonly saving = signal(false);
  protected readonly editing = signal<Area | null>(null);
  protected readonly modalOpen = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(255)],
    active: [true],
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.areas().subscribe({
      next: (list) => {
        this.areas.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '', description: '', active: true });
    this.modalOpen.set(true);
  }

  protected openEdit(area: Area): void {
    this.editing.set(area);
    this.form.reset({ name: area.name, description: area.description ?? '', active: area.active });
    this.modalOpen.set(true);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const body = { name: value.name.trim(), description: value.description.trim() || null, active: value.active };
    const current = this.editing();
    const request = current ? this.api.updateArea(current.id, body) : this.api.createArea(body);
    this.saving.set(true);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(current ? `Area "${saved.name}" updated.` : `Area "${saved.name}" created.`);
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  protected async remove(area: Area): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete ${area.name}?`,
      message: 'This permanently removes the area.',
      icon: 'bi-trash',
      tone: 'danger',
      notes: ['Only possible when no employees are assigned. Otherwise, edit the area and mark it inactive.'],
      confirmText: 'Delete area',
    });
    if (!ok) {
      return;
    }
    this.api.deleteArea(area.id).subscribe(() => {
      this.toast.success(`Area "${area.name}" deleted.`);
      this.load();
    });
  }
}
