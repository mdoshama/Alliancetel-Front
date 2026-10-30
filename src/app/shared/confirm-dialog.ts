import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmService } from '../core/confirm.service';

/** Renders ConfirmService requests as an AllianceTel-styled card. Place once in the app root. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [FormsModule],
  template: `
    @if (confirm.current(); as req) {
      <div class="modal d-block confirm-modal" tabindex="-1" role="alertdialog" aria-modal="true"
           [attr.aria-labelledby]="'confirm-title'" (keydown.escape)="cancel()"
           (click)="onBackdropClick($event)">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content confirm-card shadow-lg">
            <div class="modal-body p-4">
              <div class="d-flex gap-3">
                <div class="confirm-icon tone-{{ req.tone ?? 'primary' }}">
                  <i class="bi {{ req.icon ?? defaultIcon(req.tone) }}"></i>
                </div>
                <div class="flex-grow-1">
                  <h5 class="fw-bold mb-1" id="confirm-title">{{ req.title }}</h5>
                  <p class="text-muted-2 mb-0">{{ req.message }}</p>
                </div>
              </div>
              @if (req.notes?.length) {
                <ul class="confirm-notes tone-{{ req.tone ?? 'primary' }} mt-3 mb-0">
                  @for (n of req.notes; track n) {
                    <li>{{ n }}</li>
                  }
                </ul>
              }
              @if (req.input) {
                <div class="mt-3">
                  <label class="form-label small" for="confirm-input">{{ req.input.label }}</label>
                  <input #inputEl id="confirm-input" class="form-control" [placeholder]="req.input.placeholder ?? ''"
                         [attr.maxlength]="req.input.maxLength ?? 255" [(ngModel)]="text" (keydown.enter)="ok()" />
                </div>
              }
            </div>
            <div class="modal-footer border-0 pt-0 px-4 pb-4">
              <button type="button" class="btn btn-light" (click)="cancel()">{{ req.cancelText ?? 'Cancel' }}</button>
              <button #okButton type="button" class="btn" [class]="'btn btn-' + (req.tone === 'danger' ? 'danger' : req.tone === 'warning' ? 'warning' : req.tone === 'success' ? 'success' : 'primary')"
                      [disabled]="req.input?.required && !text.trim()"
                      (click)="ok()">{{ req.confirmText ?? 'Confirm' }}</button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop show confirm-backdrop" (click)="cancel()"></div>
    }
  `,
})
export class ConfirmDialog {
  protected readonly confirm = inject(ConfirmService);
  protected text = '';
  private readonly okButton = viewChild<ElementRef<HTMLButtonElement>>('okButton');
  private readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('inputEl');
  private readonly focused = signal<object | null>(null);

  constructor() {
    // Focus the text box (or the confirm button) when a dialog opens, so Enter/Escape work straight away.
    effect(() => {
      const req = this.confirm.current();
      const target = this.inputEl() ?? this.okButton();
      if (req && target && this.focused() !== req) {
        this.focused.set(req);
        this.text = '';
        queueMicrotask(() => target.nativeElement.focus());
      }
    });
  }

  protected defaultIcon(tone?: string): string {
    return tone === 'danger'
      ? 'bi-exclamation-octagon'
      : tone === 'warning'
        ? 'bi-exclamation-triangle'
        : tone === 'success'
          ? 'bi-check-circle'
          : 'bi-question-circle';
  }

  protected ok(): void {
    const req = this.confirm.current();
    if (req?.input?.required && !this.text.trim()) {
      return;
    }
    req?.resolve(req.input ? this.text.trim() : '');
  }

  /** Cancels when the dimmed area is clicked. Returns nothing: a false return would cancel clicks inside the card. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancel();
    }
  }

  protected cancel(): void {
    this.confirm.current()?.resolve(null);
  }
}
