import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { siteUrl } from '../../core/api-base';
import { AuthService } from '../../core/auth.service';
import { describeError } from '../../core/error.interceptor';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule],
  templateUrl: './login-page.html',
})
export class LoginPage {
  protected readonly year = new Date().getFullYear();
  protected readonly siteUrl = siteUrl;
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  /** Query params: where to go after signing in, and why we got here. */
  readonly returnUrl = input<string>();
  readonly reason = input<string>();

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  /** "Forgot password?" panel: closed, open, sending, or sent. */
  protected readonly forgot = signal<'closed' | 'open' | 'sending' | 'sent'>('closed');
  protected readonly forgotError = signal<string | null>(null);
  protected readonly forgotLogin = signal('');

  protected openForgot(): void {
    this.forgotLogin.set(this.form.controls.email.value.trim());
    this.forgotError.set(null);
    this.forgot.set('open');
  }

  protected sendForgot(): void {
    const login = this.forgotLogin().trim();
    if (!login) {
      this.forgotError.set('Enter the email or phone number you sign in with.');
      return;
    }
    this.forgot.set('sending');
    this.forgotError.set(null);
    this.auth.forgotPassword(login).subscribe({
      next: () => this.forgot.set('sent'),
      error: (err: HttpErrorResponse) => {
        this.forgot.set('open');
        this.forgotError.set(describeError(err));
      },
    });
  }

  protected readonly form = this.fb.nonNullable.group({
    /** Their email or their phone number. */
    email: ['', [Validators.required, Validators.maxLength(120)]],
    password: ['', Validators.required],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set(null);
    this.auth.login(email.trim(), password).subscribe({
      next: (res) => {
        this.submitting.set(false);
        if (res.user.mustChangePassword) {
          this.router.navigate(['/change-password']);
          return;
        }
        const target = this.returnUrl();
        this.router.navigateByUrl(target && target.startsWith('/') ? target : this.auth.homeUrl());
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err.status === 401 ? 'Wrong email, phone number or password.' : describeError(err));
      },
    });
  }
}
