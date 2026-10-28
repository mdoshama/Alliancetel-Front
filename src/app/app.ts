import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toasts } from './layout/toasts';
import { ConfirmDialog } from './shared/confirm-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toasts, ConfirmDialog],
  template: `<router-outlet /><app-confirm-dialog /><app-toasts />`,
})
export class App {}
