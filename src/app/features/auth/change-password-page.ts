import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { PASSWORD_HINT, PASSWORD_MAX, passwordProblem } from '../../core/password-rules';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { describeError } from '../../core/error.interceptor';
import { ToastService } from '../../core/toast.service';


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

  protected readonly hint = PASSWORD_HINT;
  protected readonly maxLength = PASSWORD_MAX;

  /** Checks the new password against the same rules as the server, including the person's own name and email. */
  private readonly strongPassword = (control: AbstractControl): ValidationErrors | null => {
    const user = this.auth.user();
    const problem = passwordProblem((control.value as string) ?? '', [user?.fullName, user?.email]);
    return problem ? { weak: problem } : null;
  };

  protected readonly form = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, this.strongPassword]],
    confirmPassword: ['', Validators.required],
  });

  /** What's wrong with the new password, once they've typed in it. */
  protected newPasswordProblem(): string | null {
    const control = this.form.controls.newPassword;
    if (!control.touched && !control.dirty) {
      return null;
    }
    return (control.errors?.['weak'] as string | undefined) ?? (control.errors?.['required'] ? 'Required.' : null);
  }

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
