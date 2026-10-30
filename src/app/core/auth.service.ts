import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { LoginResponse, Me, Role } from './models';

const STORAGE_KEY = 'alliancetel.session';

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
  readonly isManager = computed(() => this.role() === 'MANAGER');
  readonly isEmployee = computed(() => this.role() === 'EMPLOYEE');
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

  hasRole(...roles: Role[]): boolean {
    const role = this.role();
    return role !== null && roles.includes(role);
  }

  /** Where someone lands after signing in. */
  homeUrl(): string {
    return this.isEmployee() ? '/schedules' : '/dashboard';
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

  logout(reason?: 'expired'): void {
    this.clear();
    this.router.navigate(['/login'], reason ? { queryParams: { reason } } : {});
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
