import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { ROLE_LABELS, Role } from '../core/models';

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
    items: [{ label: 'Dashboard', icon: 'bi-speedometer2', path: '/dashboard', roles: ['ADMIN', 'MANAGER'] }],
  },
  {
    title: 'Scheduling',
    items: [
      { label: 'Weekly Schedule', employeeLabel: 'My Schedule', icon: 'bi-calendar3-week', path: '/schedules', roles: ALL },
      { label: 'Day-off Requests', employeeLabel: 'My Days Off', icon: 'bi-calendar-x', path: '/day-off-requests', roles: ALL },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Employees', icon: 'bi-people', path: '/employees', roles: ['ADMIN'] },
      { label: 'My Team', icon: 'bi-people', path: '/employees', roles: ['MANAGER'] },
      { label: 'Areas', icon: 'bi-geo-alt', path: '/areas', roles: ['ADMIN'] },
      { label: 'Stores', icon: 'bi-shop', path: '/stores', roles: ['ADMIN'] },
    ],
  },
];

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
  protected readonly heading = signal('');

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

  protected closeMobile(): void {
    this.mobileOpen.set(false);
  }

  protected signOut(): void {
    this.auth.logout();
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
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === 'true';
  } catch {
    return false;
  }
}
