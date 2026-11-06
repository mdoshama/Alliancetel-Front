import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { formatDay } from '../../core/date-utils';
import { ROLE_LABELS } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import {
  BIRTH_MAX_AGE,
  BIRTH_MIN_AGE,
  applyServerErrors,
  birthDateRule,
  fieldError,
  formatPhone,
  normalizePhone,
  phoneRule,
  yearsAgo,
} from '../../core/validation';
import { SMS_CONSENT_TEXT } from '../legal/legal-info';

/**
 * My Profile: everyone sees their account details and can update their own phone number, birth date and how they
 * get schedule updates. Name, NTID (employee code), email, role, area and store are kept by admins.
 */
@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './profile-page.html',
})
export class ProfilePage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(FormBuilder);

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly formatPhone = formatPhone;
  protected readonly fieldError = fieldError;
  protected readonly birthDateMax = yearsAgo(BIRTH_MIN_AGE);
  protected readonly birthDateMin = yearsAgo(BIRTH_MAX_AGE);
  protected readonly smsConsentText = SMS_CONSENT_TEXT;

  protected readonly saving = signal(false);
  protected readonly savingPrefs = signal(false);
  protected readonly smsConsentOpen = signal(false);
  protected readonly smsAgreed = signal(false);

  protected readonly initials = computed(() =>
    (this.auth.user()?.fullName ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join(''),
  );

  protected readonly form = this.fb.nonNullable.group({
    phone: ['', [Validators.maxLength(30), phoneRule]],
    birthDate: ['', [birthDateRule]],
  });

  ngOnInit(): void {
    this.fill();
    // Pick up anything an admin changed since sign-in.
    this.auth.refresh().subscribe({ next: () => this.fill(), error: () => undefined });
  }

  private fill(): void {
    const u = this.auth.user();
    this.form.reset({ phone: formatPhone(u?.phone ?? ''), birthDate: u?.birthDate ?? '' });
  }

  protected birthdayLabel(): string | null {
    const b = this.auth.user()?.birthDate;
    return b ? formatDay(b, { month: 'long', day: 'numeric', year: 'numeric' }) : null;
  }

  protected tidyPhone(): void {
    const c = this.form.controls.phone;
    try {
      const n = normalizePhone(c.value);
      if (n) c.setValue(formatPhone(n));
    } catch {
      // Left as typed; the field shows what's wrong.
    }
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const phone = normalizePhone(v.phone);
    const user = this.auth.user();
    if (user?.phone && phone !== user.phone && user.smsOptIn) {
      const ok = await this.confirm.ask({
        title: 'Change your phone number?',
        message: 'Text messages will be turned off for the new number until you agree to them again.',
        icon: 'bi-telephone',
        confirmText: 'Save number',
      });
      if (!ok) return;
    }
    this.saving.set(true);
    this.auth.updateProfile(phone, v.birthDate.trim() || null).subscribe({
      next: () => {
        this.saving.set(false);
        this.fill();
        this.form.markAsPristine();
        this.toast.success('Profile saved.');
      },
      error: (err) => {
        this.saving.set(false);
        applyServerErrors(this.form, err);
      },
    });
  }

  protected toggleEmail(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.savePref(this.auth.setEmailUpdates(on), event, on ? "You'll get your schedule by email." : 'Email schedule updates turned off.');
  }

  protected toggleWhatsapp(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.savePref(this.auth.setWhatsapp(on), event, on ? "You'll get your schedule on WhatsApp." : 'WhatsApp schedule updates turned off.');
  }

  /** Texts need the person's own agreement (US carrier rules): turning them on shows the consent first. */
  protected toggleSms(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    if (on) {
      this.smsAgreed.set(false);
      this.smsConsentOpen.set(true);
      return;
    }
    if (this.smsConsentOpen()) {
      this.smsConsentOpen.set(false);
      return;
    }
    this.savePref(this.auth.setSms(false), event, 'Text message updates turned off.');
  }

  protected agreeToSms(): void {
    if (!this.smsAgreed()) return;
    this.savePref(this.auth.setSms(true), undefined, "You'll get your schedule by text message.", () =>
      this.smsConsentOpen.set(false),
    );
  }

  private savePref(
    request: ReturnType<AuthService['setSms']>,
    event: Event | undefined,
    message: string,
    done?: () => void,
  ): void {
    this.savingPrefs.set(true);
    request.subscribe({
      next: () => {
        this.savingPrefs.set(false);
        done?.();
        this.toast.success(message);
      },
      error: () => {
        this.savingPrefs.set(false);
        if (event) {
          const box = event.target as HTMLInputElement;
          box.checked = !box.checked;
        }
      },
    });
  }

  protected async signOutEverywhere(): Promise<void> {
    const sure = await this.confirm.ask({
      title: 'Sign out everywhere?',
      message: "You'll be signed out on every phone and computer, including this one.",
      icon: 'bi-phone',
      confirmText: 'Sign out everywhere',
      tone: 'danger',
    });
    if (sure) {
      this.auth.logoutEverywhere().subscribe();
    }
  }
}
