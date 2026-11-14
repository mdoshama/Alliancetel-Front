import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { LoginResponse, Me, Role, SetupLinkInfo } from './models';

const STORAGE_KEY = 'alliancetel.session';
const AREA_KEY = 'alliancetel.area';

function readChosenArea(): number | null {
  try {
    const v = Number(localStorage.getItem(AREA_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

interface StoredSession {
  token: string;
  expiresAt: string;
  user: Me;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly session = signal<StoredSession | null>(readSession());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isLoggedIn = computed(() => this.session() !== null);
  readonly role = computed<Role | null>(() => this.user()?.role ?? null);
  readonly isAdmin = computed(() => this.role() === 'ADMIN');
  /** A manager of either kind: of one area, or a Market Manager of several. */
  readonly isManager = computed(() => this.role() === 'MANAGER' || this.role() === 'MARKET_MANAGER');
  readonly isMarketManager = computed(() => this.role() === 'MARKET_MANAGER');
  /** The areas they manage (empty for admins, who manage all, and for staff). */
  readonly managedAreas = computed(() => this.user()?.managedAreas ?? []);
  /** A Market Manager works in one of their areas at a time, chosen at the top of the app (kept on this device). */
  private readonly chosenArea = signal<number | null>(readChosenArea());
  /** The area the app is working in: a Market Manager's chosen one, everyone else's own area. */
  readonly areaId = computed<number | null>(() => {
    const u = this.user();
    if (!u) return null;
    if (u.role === 'MARKET_MANAGER') {
      const areas = u.managedAreas ?? [];
      const chosen = this.chosenArea();
      return areas.some((a) => a.id === chosen) ? chosen : (u.areaId ?? areas[0]?.id ?? null);
    }
    return u.areaId;
  });
  readonly areaName = computed(() => {
    const u = this.user();
    if (u?.role === 'MARKET_MANAGER') return this.managedAreas().find((a) => a.id === this.areaId())?.name ?? null;
    return u?.areaName ?? null;
  });
  readonly isEmployee = computed(() => this.role() === 'EMPLOYEE');
  readonly isBackOffice = computed(() => this.role() === 'BACK_OFFICE');
  /** Admins and managers can build schedules and decide on requests. */
  readonly canManage = computed(() => this.isAdmin() || this.isManager());

  token(): string | null {
    const s = this.session();
    if (s && new Date(s.expiresAt).getTime() <= Date.now()) {
      this.clear();
      return null;
    }
    return s?.token ?? null;
  }

  /** A Market Manager can go wherever a manager can. */
  hasRole(...roles: Role[]): boolean {
    const role = this.role();
    return role !== null && (roles.includes(role) || (role === 'MARKET_MANAGER' && roles.includes('MANAGER')));
  }

  /** Market Managers: switch the area the app works in. */
  setArea(id: number): void {
    this.chosenArea.set(id);
    try {
      localStorage.setItem(AREA_KEY, String(id));
    } catch {
      // Storage unavailable: the choice lasts until the app is closed.
    }
  }

  /** Where someone lands after signing in. */
  homeUrl(): string {
    return this.isEmployee() ? '/schedules' : this.isBackOffice() ? '/time-clock' : '/dashboard';
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>('/api/auth/login', { email, password })
      .pipe(tap((res) => this.store(res)));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>('/api/auth/change-password', { currentPassword, newPassword })
      .pipe(tap((res) => this.store(res)));
  }

  /**
   * "Forgot password?": asks for a set-password link to be emailed (or texted when there's no email). The answer is
   * the same whether or not the account exists.
   */
  forgotPassword(login: string): Observable<void> {
    return this.http.post<void>('/api/auth/forgot-password', { login });
  }

  /**
   * Deletes your own account for good (your password confirms it). Personal details and messages are erased on the
   * server and every device is signed out; this one goes back to sign-in.
   */
  deleteAccount(password: string): Observable<void> {
    return this.http.post<void>('/api/auth/me/delete', { password }).pipe(
      tap(() => {
        this.clear();
        this.router.navigate(['/login'], { queryParams: { reason: 'deleted' } });
      }),
    );
  }

  /** Saves your own phone number and birth date (everything else is kept by admins). */
  updateProfile(phone: string | null, birthDate: string | null): Observable<Me> {
    return this.http.put<Me>('/api/auth/me/profile', { phone, birthDate }).pipe(
      tap((user) => {
        const s = this.session();
        if (s) {
          this.save({ ...s, user });
        }
      }),
    );
  }

  /** Who a set-password link (from the welcome or reset email / text) is for. */
  checkSetupLink(token: string): Observable<SetupLinkInfo> {
    return this.http.post<SetupLinkInfo>('/api/auth/setup-password/check', { token });
  }

  /** Chooses a password from a set-password link, then signs in. */
  setupPassword(token: string, newPassword: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>('/api/auth/setup-password', { token, newPassword })
      .pipe(tap((res) => this.store(res)));
  }

  /** Turns the signed-in person's WhatsApp schedule updates on or off. */
  setWhatsapp(optIn: boolean): Observable<Me> {
    return this.http.put<Me>('/api/auth/me/whatsapp', { optIn }).pipe(
      tap((user) => {
        const s = this.session();
        if (s) {
          this.save({ ...s, user });
        }
      }),
    );
  }

  /** Turns the signed-in person's text-message updates on or off (only they can agree to texts). */
  setSms(optIn: boolean): Observable<Me> {
    return this.http.put<Me>('/api/auth/me/sms', { optIn }).pipe(
      tap((user) => {
        const s = this.session();
        if (s) {
          this.save({ ...s, user });
        }
      }),
    );
  }

  /** Turns the signed-in person's email schedule updates on or off. */
  setEmailUpdates(optIn: boolean): Observable<Me> {
    return this.http.put<Me>('/api/auth/me/email', { optIn }).pipe(
      tap((user) => {
        const s = this.session();
        if (s) {
          this.save({ ...s, user });
        }
      }),
    );
  }

  /** Re-reads the profile, e.g. after an admin changed this person's area. */
  refresh(): Observable<Me> {
    return this.http.get<Me>('/api/auth/me').pipe(
      tap((user) => {
        const s = this.session();
        if (s) {
          this.save({ ...s, user });
        }
      }),
    );
  }

  /**
   * Signs out this device. Unless the session already ended on the server, the server is told too, so a copied
   * token stops working. Other devices stay signed in.
   */
  logout(reason?: 'expired'): void {
    const token = reason ? null : this.session()?.token;
    if (token) {
      this.http
        .post<void>('/api/auth/logout', null, { headers: { Authorization: `Bearer ${token}` } })
        .subscribe({ error: () => undefined });
    }
    this.clear();
    this.router.navigate(['/login'], reason ? { queryParams: { reason } } : {});
  }

  /** Ends every session of this person (all browsers and phones), then signs out here. */
  logoutEverywhere(): Observable<void> {
    return this.http.post<void>('/api/auth/logout-everywhere', null).pipe(
      tap(() => {
        this.clear();
        this.router.navigate(['/login']);
      }),
    );
  }

  private store(res: LoginResponse): void {
    this.save({ token: res.token, expiresAt: res.expiresAt, user: res.user });
  }

  private save(s: StoredSession): void {
    this.session.set(s);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // Storage unavailable: the session still works until the tab is closed.
    }
  }

  private clear(): void {
    this.session.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
  }
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const s = JSON.parse(raw) as StoredSession;
    return s.token && new Date(s.expiresAt).getTime() > Date.now() ? s : null;
  } catch {
    return null;
  }
}
