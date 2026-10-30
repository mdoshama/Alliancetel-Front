import { emailRule } from '../../core/validation';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { describeError } from '../../core/error.interceptor';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule],
  templateUrl: './login-page.html',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  /** Query params: where to go after signing in, and why we got here. */
  readonly returnUrl = input<string>();
  readonly reason = input<string>();

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.maxLength(120), emailRule]],
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
        this.error.set(err.status === 401 ? 'Invalid email or password.' : describeError(err));
      },
    });
  }
}
