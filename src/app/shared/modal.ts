import { Component, input, output } from '@angular/core';

/** Lightweight Bootstrap-styled modal driven by Angular state instead of Bootstrap's JS. */
@Component({
  selector: 'app-modal',
  template: `
    @if (open()) {
      <div class="modal d-block" tabindex="-1" role="dialog" aria-modal="true" (keydown.escape)="closed.emit()"
           (click)="$event.target === $event.currentTarget && closed.emit()">
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable" [class]="'modal-' + size()">
          <div class="modal-content shadow">
            <div class="modal-header">
              <h5 class="modal-title">{{ title() }}</h5>
              <button type="button" class="btn-close" aria-label="Close" (click)="closed.emit()"></button>
            </div>
            <div class="modal-body">
              <ng-content />
            </div>
            <div class="modal-footer">
              <ng-content select="[modal-footer]" />
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop show" (click)="closed.emit()"></div>
    }
  `,
})
export class Modal {
  readonly open = input(false);
  readonly title = input('');
  readonly size = input<'sm' | 'md' | 'lg' | 'xl'>('md');
  readonly closed = output<void>();
}
