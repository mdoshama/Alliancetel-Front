import { Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toasts',
  template: `
    <div class="toast-container position-fixed top-0 end-0 p-3">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast show align-items-center border-0 text-bg-{{ toast.kind }}" role="alert">
          <div class="d-flex">
            <div class="toast-body">{{ toast.message }}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Close"
                    (click)="toastService.dismiss(toast.id)"></button>
          </div>
        </div>
      }
    </div>
  `,
})
export class Toasts {
  protected readonly toastService = inject(ToastService);
}
