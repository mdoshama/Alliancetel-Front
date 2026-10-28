import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './auth.guards';
import { Role } from './models';
import { storeTestSession } from './test-session';

function run(guard: typeof authGuard, data: Record<string, unknown> = {}, url = '/employees') {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
  const route = { data } as unknown as ActivatedRouteSnapshot;
  const state = { url } as RouterStateSnapshot;
  const result = TestBed.runInInjectionContext(() => guard(route, state));
  const router = TestBed.inject(Router);
  return result instanceof UrlTree ? router.serializeUrl(result) : result;
}

describe('auth guards', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('sends signed-out visitors to the login page with a return URL', () => {
    expect(run(authGuard)).toBe('/login?returnUrl=%2Femployees');
  });

  it('forces a password change before anything else', () => {
    storeTestSession('EMPLOYEE', { mustChangePassword: true });
    expect(run(authGuard)).toBe('/change-password');
  });

  it('lets signed-in users through', () => {
    storeTestSession('EMPLOYEE');
    expect(run(authGuard)).toBe(true);
  });

  it.each<[Role, boolean | string]>([
    ['ADMIN', true],
    ['MANAGER', '/dashboard'],
    ['EMPLOYEE', '/schedules'],
  ])('admin-only pages for %s -> %s', (role, expected) => {
    storeTestSession(role);
    expect(run(roleGuard, { roles: ['ADMIN'] })).toBe(expected);
  });

  it('keeps signed-in users off the login page', () => {
    storeTestSession('MANAGER');
    expect(run(guestGuard)).toBe('/dashboard');
  });
});
