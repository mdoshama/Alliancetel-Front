import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { describeError } from '../../core/error.interceptor';
import { SetupLinkInfo } from '../../core/models';
import { PASSWORD_HINT, PASSWORD_MAX, passwordProblem } from '../../core/password-rules';
import { ToastService } from '../../core/toast.service';

/**
 * Opened from the link in the welcome or password-reset email / text: choose a password and you're signed in.
 * The link works once and expires; the temporary password from the admin stays as a backup.
 */
@Component({
  selector: 'app-set-password-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './set-password-page.html',
})
export class SetPasswordPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  /** ?t= from the link. */
  readonly t = input<string>();

  protected readonly info = signal<SetupLinkInfo | null>(null);
  protected readonly linkError = signal<string | null>(null);
  protected readonly checking = signal(true);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hint = PASSWORD_HINT;
  protected readonly maxLength = PASSWORD_MAX;

  private readonly strongPassword = (control: AbstractControl): ValidationErrors | null => {
    const i = this.info();
    const problem = passwordProblem((control.value as string) ?? '', [i?.firstName, i?.email]);
    return problem ? { weak: problem } : null;
  };

  protected readonly form = this.fb.nonNullable.group({
    newPassword: ['', [Validators.required, this.strongPassword]],
    confirmPassword: ['', Validators.required],
  });

  ngOnInit(): void {
    const token = (this.t() ?? '').trim();
    if (!token) {
      this.checking.set(false);
      this.linkError.set('This link is incomplete. Open it again from your email or text message.');
      return;
    }
    this.auth.checkSetupLink(token).subscribe({
      next: (info) => {
        this.info.set(info);
        this.checking.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.checking.set(false);
        this.linkError.set(describeError(err));
      },
    });
  }

  protected newPasswordProblem(): string | null {
    const c = this.form.controls.newPassword;
    if (!c.touched && !c.dirty) return null;
    return (c.errors?.['weak'] as string | undefined) ?? (c.errors?.['required'] ? 'Required.' : null);
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
    this.auth.setupPassword((this.t() ?? '').trim(), v.newPassword).subscribe({
      next: () => {
        this.submitting.set(false);
        this.toast.success(`Password saved. Welcome${this.info() ? ', ' + this.info()!.firstName : ''}!`);
        this.router.navigateByUrl(this.auth.homeUrl());
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(describeError(err));
      },
    });
  }
}
