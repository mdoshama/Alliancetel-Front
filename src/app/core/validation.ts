import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Form rules shared by every page. They match the server's rules (InputRules.java in the backend), so people see a
 * problem next to the field before saving. A blank value passes; Validators.required says when one is needed.
 */
export const RULES = {
  personName: { re: /^\s*$|^\s*[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u, msg: 'Use letters, spaces, hyphens, apostrophes and periods only.' },
  code: { re: /^\s*$|^\s*[A-Za-z0-9][A-Za-z0-9_-]*\s*$/, msg: 'Use letters, numbers, - and _ only (no spaces).' },
  email: { re: /^\s*$|^\s*[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\s*$/, msg: 'Enter a valid email like name@example.com.' },
  placeName: { re: /^\s*$|^\s*[\p{L}\p{N}][\p{L}\p{M}\p{N} &.,'’()/#-]*$/u, msg: "Use letters, numbers, spaces and & . , ' ( ) / # - only." },
  safeText: { re: /^[^<>\p{Cc}]*$/u, msg: "Can't contain < or > or line breaks." },
} as const;

function rule(name: keyof typeof RULES): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = control.value;
    return v == null || RULES[name].re.test(String(v)) ? null : { rule: RULES[name].msg };
  };
}

export const personName = rule('personName');
export const codeRule = rule('code');
export const emailRule = rule('email');
export const placeName = rule('placeName');
export const safeText = rule('safeText');

/** Not just spaces. */
export const notBlank: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value.length > 0 && control.value.trim() === '' ? { required: true } : null;

/**
 * A phone number in international form, e.g. "(619) 555-0142" → "+16195550142". Numbers without a country code are
 * US/Canada numbers. Returns null for a blank value and throws a message for an invalid one.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  const invalid = 'Enter a valid phone number, e.g. (619) 555-0142 or +977 981 234 5678.';
  if (!/^[0-9+() .-]+$/.test(raw) || raw.lastIndexOf('+') > 0) throw new Error(invalid);
  let digits = raw.replace(/\D/g, '');
  let international = raw.startsWith('+');
  if (!international && digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }
  if (!international) {
    if (digits.length === 10) digits = '1' + digits;
    else if (!(digits.length === 11 && digits.startsWith('1'))) {
      throw new Error('A US number has 10 digits. For other countries start with + and the country code.');
    }
  }
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) throw new Error(invalid);
  if (digits.startsWith('1') && (digits.length !== 11 || digits[1] < '2' || digits[4] < '2')) throw new Error(invalid);
  return '+' + digits;
}

export const phoneRule: ValidatorFn = (control) => {
  try {
    normalizePhone(control.value);
    return null;
  } catch (e) {
    return { rule: (e as Error).message };
  }
};

/** "+16195550142" → "(619) 555-0142"; other countries as "+977 9812345678". */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  return phone;
}

/** The message to show under a field, or '' when it's fine or not touched yet. */
export function fieldError(control: AbstractControl | null, label: string): string {
  if (!control || !control.invalid || !(control.touched || control.dirty)) return '';
  const e = control.errors ?? {};
  if (e['required']) return `${label} is required.`;
  if (e['maxlength']) return `${label} can be at most ${e['maxlength'].requiredLength} characters.`;
  if (e['minlength']) return `${label} needs at least ${e['minlength'].requiredLength} characters.`;
  if (e['min']) return `${label} must be at least ${e['min'].min}.`;
  if (e['max']) return `${label} can be at most ${e['max'].max}.`;
  if (e['email']) return RULES.email.msg;
  if (e['rule']) return e['rule'];
  return `Check ${label.toLowerCase()}.`;
}

/** Trims text before saving; blank becomes null. */
export function clean(text: string | null | undefined): string | null {
  const t = (text ?? '').trim().replace(/\s{2,}/g, ' ');
  return t ? t : null;
}

/**
 * Puts the server's field messages (ProblemDetail "errors") on the matching form fields, so a problem the
 * browser couldn't catch (e.g. a code already in use is a toast, but a bad value shows under its field).
 */
export function applyServerErrors(form: { get(path: string): AbstractControl | null }, err: unknown): void {
  const errors = (err as { error?: { errors?: Record<string, string> } })?.error?.errors;
  if (!errors) return;
  for (const [field, message] of Object.entries(errors)) {
    const control = form.get(field);
    if (control) {
      control.setErrors({ rule: message });
      control.markAsTouched();
    }
  }
}

/** A whole number (no decimals). */
export const wholeNumber: ValidatorFn = (control) =>
  control.value === null || control.value === '' || Number.isInteger(Number(control.value)) ? null : { rule: 'Use a whole number.' };
