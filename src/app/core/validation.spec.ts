import { FormControl, Validators } from '@angular/forms';
import { codeRule, emailRule, fieldError, formatPhone, normalizePhone, personName, phoneRule, placeName, safeText } from './validation';

describe('validation', () => {
  const ok = (v: unknown, fn: (c: FormControl) => unknown) => fn(new FormControl(v)) === null;

  it('accepts real names and rejects digits or markup', () => {
    expect(ok('José', personName)).toBe(true);
    expect(ok("O'Neil-Smith", personName)).toBe(true);
    expect(ok('St. John', personName)).toBe(true);
    expect(ok('Ana3', personName)).toBe(false);
    expect(ok('<b>', personName)).toBe(false);
    expect(ok('', personName)).toBe(true);
  });

  it('codes, emails, places and free text', () => {
    expect(ok('AT-1050', codeRule)).toBe(true);
    expect(ok('AT 1050', codeRule)).toBe(false);
    expect(ok('name@example.com', emailRule)).toBe(true);
    expect(ok('name@example', emailRule)).toBe(false);
    expect(ok('Oceanside #2 (North)', placeName)).toBe(true);
    expect(ok('<script>', placeName)).toBe(false);
    expect(ok('401 Mission Ave, Oceanside', safeText)).toBe(true);
    expect(ok('a\nb', safeText)).toBe(false);
  });

  it('normalizes phone numbers like the server', () => {
    expect(normalizePhone('(619) 555-0142')).toBe('+16195550142');
    expect(normalizePhone('+977 981-234-5678')).toBe('+9779812345678');
    expect(normalizePhone('0091 98765 43210')).toBe('+919876543210');
    expect(normalizePhone('  ')).toBeNull();
    for (const bad of ['abc', '555-0142', '(019) 555-0142', '6+19 555 0142', '98123456789']) {
      expect(() => normalizePhone(bad)).toThrow();
    }
    expect(ok('call me', phoneRule)).toBe(false);
    expect(formatPhone('+16195550142')).toBe('(619) 555-0142');
    expect(formatPhone('+9779812345678')).toBe('+9779812345678');
  });

  it('gives a message per problem once the field is touched', () => {
    const c = new FormControl('', Validators.required);
    expect(fieldError(c, 'First name')).toBe('');
    c.markAsTouched();
    expect(fieldError(c, 'First name')).toBe('First name is required.');
    const d = new FormControl('Ana3', personName);
    d.markAsTouched();
    expect(fieldError(d, 'First name')).toContain('letters');
  });
});
