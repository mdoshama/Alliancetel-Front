import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { storeTestSession } from './test-session';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'login', children: [] }]), provideHttpClient(), provideHttpClientTesting()],
  });
  return { auth: TestBed.inject(AuthService), http: TestBed.inject(HttpTestingController) };
}

describe('AuthService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('stores the session on login and exposes the role', () => {
    const { auth, http } = setup();
    expect(auth.isLoggedIn()).toBe(false);

    auth.login('maria@alliancetel.example', 'Welcome123').subscribe();
    const req = http.expectOne('/api/auth/login');
    expect(req.request.body).toEqual({ email: 'maria@alliancetel.example', password: 'Welcome123' });
    req.flush({
      token: 'abc',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      user: { id: 3, employeeCode: 'AT-1001', fullName: 'Maria Garcia', email: 'maria@alliancetel.example',
              role: 'MANAGER', areaId: 2, areaName: 'San Diego', mustChangePassword: false },
    });

    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.token()).toBe('abc');
    expect(auth.isManager()).toBe(true);
    expect(auth.canManage()).toBe(true);
    expect(auth.homeUrl()).toBe('/dashboard');
    expect(localStorage.getItem('alliancetel.session')).toContain('abc');
  });

  it('sends employees to their schedule after sign-in', () => {
    storeTestSession('EMPLOYEE');
    const { auth } = setup();
    expect(auth.canManage()).toBe(false);
    expect(auth.homeUrl()).toBe('/schedules');
  });

  it('forgets an expired session', () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    localStorage.setItem('alliancetel.session', JSON.stringify({ token: 'old', expiresAt: expired, user: {} }));
    const { auth } = setup();
    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.token()).toBeNull();
  });

  it('clears everything on logout and tells the server to end the session', () => {
    storeTestSession('ADMIN');
    const { auth, http } = setup();
    auth.logout();
    expect(auth.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('alliancetel.session')).toBeNull();
    const req = http.expectOne('/api/auth/logout');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('can end every session', () => {
    storeTestSession('EMPLOYEE');
    const { auth, http } = setup();
    auth.logoutEverywhere().subscribe();
    http.expectOne('/api/auth/logout-everywhere').flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.isLoggedIn()).toBe(false);
    http.expectNone('/api/auth/logout');
  });

  it('does not call the server when the session already expired there', () => {
    storeTestSession('ADMIN');
    const { auth, http } = setup();
    auth.logout('expired');
    http.expectNone('/api/auth/logout');
    expect(auth.isLoggedIn()).toBe(false);
  });
});
