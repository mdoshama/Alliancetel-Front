import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { describeError } from '../../core/error.interceptor';
import { ToastService } from '../../core/toast.service';

function strongPassword(control: AbstractControl): ValidationErrors | null {
  const v = (control.value as string) ?? '';
  return v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v) ? null : { weak: true };
}

@Component({
  selector: 'app-change-password-page',
  imports: [ReactiveFormsModule],
  templateUrl: './change-password-page.html',
})
export class ChangePasswordPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  /** True when signing in with a temporary password; the user cannot skip this step. */
  protected readonly forced = computed(() => this.auth.user()?.mustChangePassword ?? false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, strongPassword]],
    confirmPassword: ['', Validators.required],
  });

  protected mismatch(): boolean {
    const { newPassword, confirmPassword } = this.form.getRawValue();
    return this.form.controls.confirmPassword.touched && confirmPassword !== newPassword;
  }

  protected submit(): void {
    const v = this.form.getRawValue();
    if (this.form.invalid || v.newPassword !== v.confirmPassword) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this.auth.changePassword(v.currentPassword, v.newPassword).subscribe({
      next: () => {
        this.submitting.set(false);
        this.toast.success('Password updated.');
        this.router.navigateByUrl(this.auth.homeUrl());
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(describeError(err));
      },
    });
  }

  protected cancel(): void {
    this.router.navigateByUrl(this.auth.homeUrl());
  }

  protected signOut(): void {
    this.auth.logout();
  }
}
