import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { ConfirmService } from '../core/confirm.service';
import { ToastService } from '../core/toast.service';
import { formatPhone } from '../core/validation';
import { HttpClient } from '@angular/common/http';
import { MessagingInfo, ROLE_LABELS, Role } from '../core/models';
import { SMS_CONSENT_TEXT } from '../features/legal/legal-info';

interface NavItem {
  label: string;
  /** Label shown to employees, whose pages are about themselves. */
  employeeLabel?: string;
  icon: string;
  path: string;
  roles: Role[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const ALL: Role[] = ['ADMIN', 'MANAGER', 'EMPLOYEE'];
const SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', icon: 'bi-grid-1x2', path: '/dashboard', roles: ['ADMIN', 'MANAGER'] },
      { label: 'Performance', icon: 'bi-graph-up-arrow', path: '/performance', roles: ['ADMIN', 'MANAGER'] },
    ],
  },
  {
    title: 'Workforce',
    items: [
      { label: 'Weekly Schedule', employeeLabel: 'My Schedule', icon: 'bi-calendar3-week', path: '/schedules', roles: ALL },
      { label: 'Day-off Requests', employeeLabel: 'My Days Off', icon: 'bi-calendar-x', path: '/day-off-requests', roles: ALL },
      { label: 'Employees', icon: 'bi-people', path: '/employees', roles: ['ADMIN'] },
      { label: 'My Team', icon: 'bi-people', path: '/employees', roles: ['MANAGER'] },
      { label: 'Messages', icon: 'bi-chat-dots', path: '/messages', roles: ['ADMIN', 'MANAGER'] },
      { label: 'Time Clock', icon: 'bi-clock-history', path: '/time-clock', roles: ['ADMIN', 'MANAGER', 'BACK_OFFICE'] },
    ],
  },
  {
    title: 'Sales & Operations',
    items: [
      { label: 'End of Day', icon: 'bi-receipt', path: '/eod', roles: ALL },
      { label: 'My Performance', icon: 'bi-graph-up-arrow', path: '/my-performance', roles: ['EMPLOYEE'] },
      { label: 'Commission', icon: 'bi-cash-coin', path: '/commission', roles: ['ADMIN'] },
    ],
  },
  {
    title: 'Organization',
    items: [
      { label: 'Areas', icon: 'bi-geo-alt', path: '/areas', roles: ['ADMIN'] },
      { label: 'Stores', icon: 'bi-shop', path: '/stores', roles: ALL },
      { label: 'Devices', icon: 'bi-phone', path: '/devices', roles: ['ADMIN'] },
    ],
  },
];

/** Shown in the sidebar footer; bump with each release. */
export const APP_VERSION = '2.0';

const COLLAPSE_KEY = 'alliancetel.sidebarCollapsed';
const DESKTOP_MIN_WIDTH = 992;

/** The signed-in frame: sliding sidebar on the left, top bar with the user menu, page content. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
})
export class Shell {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly auth = inject(AuthService);
  protected readonly roleLabels = ROLE_LABELS;

  protected readonly sections = computed(() => {
    const role = this.auth.role();
    return SECTIONS.map((s) => ({
      title: s.title,
      items: s.items
        .filter((i) => role !== null && i.roles.includes(role))
        .map((i) => ({ ...i, label: role === 'EMPLOYEE' && i.employeeLabel ? i.employeeLabel : i.label })),
    })).filter((s) => s.items.length > 0);
  });

  protected readonly initials = computed(() => {
    const name = this.auth.user()?.fullName ?? '';
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  });

  /** Desktop: sidebar shrinks to an icon rail. */
  protected readonly collapsed = signal(readCollapsed());
  /** Mobile: sidebar slides in over the page. */
  protected readonly mobileOpen = signal(false);
  protected readonly menuOpen = signal(false);
  /** Loaded the first time the account menu opens: Sandbox join instructions for WhatsApp, if used. */
  protected readonly messaging = signal<MessagingInfo | null>(null);
  private readonly http = inject(HttpClient);
  protected readonly heading = signal('');
  /** The menu section the current page belongs to (shown before the page title). */
  protected readonly section = signal('');
  protected readonly appVersion = APP_VERSION;

  constructor() {
    // The shell is created while the first navigation is still running; NavigationEnd sets the heading.
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => {
        this.updateHeading();
        this.mobileOpen.set(false);
        this.menuOpen.set(false);
      });
  }

  protected toggleSidebar(): void {
    if (window.innerWidth >= DESKTOP_MIN_WIDTH) {
      this.collapsed.update((v) => !v);
      try {
        localStorage.setItem(COLLAPSE_KEY, String(this.collapsed()));
      } catch {
        // Storage unavailable (private mode); the toggle still works for this session.
      }
    } else {
      this.mobileOpen.update((v) => !v);
    }
  }

  protected toggleMenu(): void {
    this.menuOpen.update((v) => !v);
    if (this.menuOpen() && !this.messaging() && !this.auth.isAdmin()) {
      this.http.get<MessagingInfo>('/api/auth/messaging').subscribe({
        next: (info) => this.messaging.set(info),
        error: () => undefined,
      });
    }
  }

  /** Opens WhatsApp with the join phrase ready to send to the Sandbox number. */
  protected sandboxLink(info: MessagingInfo): string {
    const number = (info.sandboxNumber ?? '').replace(/\D/g, '');
    return `https://wa.me/${number}?text=${encodeURIComponent(info.sandboxJoin ?? '')}`;
  }

  protected closeMobile(): void {
    this.mobileOpen.set(false);
  }

  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly formatPhone = formatPhone;
  protected readonly savingWhatsapp = signal(false);

  /** People turn their own WhatsApp updates on or off; Meta requires their agreement before we message them. */
  protected toggleWhatsapp(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.savingWhatsapp.set(true);
    this.auth.setWhatsapp(on).subscribe({
      next: () => {
        this.savingWhatsapp.set(false);
        this.toast.success(on ? "You'll get your schedule on WhatsApp." : 'WhatsApp schedule updates turned off.');
      },
      error: () => {
        this.savingWhatsapp.set(false);
        (event.target as HTMLInputElement).checked = !on;
      },
    });
  }

  /** Turning texts on first shows the consent wording and the SMS Terms; nothing is sent until they agree. */
  protected readonly smsConsentOpen = signal(false);
  /** The consent box's "I agree" tick, unticked each time it opens. */
  protected readonly smsAgreed = signal(false);
  protected readonly smsConsentText = SMS_CONSENT_TEXT;

  /** Texts need the person's own agreement (US carrier rules), so only they can turn this on. */
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
    this.saveSms(false, event);
  }

  protected agreeToSms(): void {
    if (!this.smsAgreed()) {
      return;
    }
    this.saveSms(true);
  }

  private saveSms(on: boolean, event?: Event): void {
    this.savingWhatsapp.set(true);
    this.auth.setSms(on).subscribe({
      next: () => {
        this.savingWhatsapp.set(false);
        this.smsConsentOpen.set(false);
        this.toast.success(on ? "You'll get your schedule by text message." : 'Text message updates turned off.');
      },
      error: () => {
        this.savingWhatsapp.set(false);
        if (event) {
          (event.target as HTMLInputElement).checked = !on;
        }
      },
    });
  }

  protected toggleEmail(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.savingWhatsapp.set(true);
    this.auth.setEmailUpdates(on).subscribe({
      next: () => {
        this.savingWhatsapp.set(false);
        this.toast.success(on ? "You'll get your schedule by email." : 'Email schedule updates turned off.');
      },
      error: () => {
        this.savingWhatsapp.set(false);
        (event.target as HTMLInputElement).checked = !on;
      },
    });
  }

  protected signOut(): void {
    this.auth.logout();
  }

  /** For a lost phone or a shared computer: ends every session, including this one. */
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

  private updateHeading(): void {
    let r = this.route;
    while (r.firstChild) {
      r = r.firstChild;
    }
    const data = r.snapshot?.data ?? {};
    const employeeHeading = data['employeeHeading'] as string | undefined;
    const managerHeading = data['managerHeading'] as string | undefined;
    const heading =
      (this.auth.isEmployee() && employeeHeading) || (this.auth.isManager() && managerHeading) || data['heading'];
    this.heading.set((heading as string) ?? '');
    const path = '/' + (this.router.url.split(/[?#]/)[0].split('/')[1] ?? '');
    const owner = this.sections().find((sec) => sec.items.some((i) => i.path === path));
    this.section.set(owner?.title ?? '');
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === 'true';
  } catch {
    return false;
  }
}
