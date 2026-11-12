import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard, signedInGuard } from './core/auth.guards';
import { AuthService } from './core/auth.service';
import { Shell } from './layout/shell';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in · AllianceTel',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    // Opened from the welcome / reset email or text: anyone with a valid link, signed in or not.
    path: 'set-password',
    title: 'Set your password · AllianceTel',
    loadComponent: () => import('./features/auth/set-password-page').then((m) => m.SetPasswordPage),
  },
  {
    path: 'change-password',
    title: 'Change password · AllianceTel',
    canActivate: [signedInGuard],
    loadComponent: () => import('./features/auth/change-password-page').then((m) => m.ChangePasswordPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    canActivateChild: [roleGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: () => inject(AuthService).homeUrl() },
      {
        path: 'dashboard',
        title: 'Dashboard · AllianceTel',
        data: { heading: 'Dashboard', roles: ['ADMIN', 'MANAGER'] },
        loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'schedules',
        title: 'Weekly Schedule · AllianceTel',
        data: { heading: 'Weekly Schedule', employeeHeading: 'My Schedule', roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
        loadComponent: () => import('./features/schedule/schedule-page').then((m) => m.SchedulePage),
      },
      {
        path: 'day-off-requests',
        title: 'Day-off Requests · AllianceTel',
        data: { heading: 'Day-off Requests', employeeHeading: 'My Days Off', roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
        loadComponent: () => import('./features/day-off/day-off-page').then((m) => m.DayOffPage),
      },
      {
        path: 'employees',
        title: 'Employees · AllianceTel',
        data: { heading: 'Employees', managerHeading: 'My Team', roles: ['ADMIN', 'MANAGER'] },
        loadComponent: () => import('./features/employees/employees-page').then((m) => m.EmployeesPage),
      },
      {
        path: 'areas',
        title: 'Areas · AllianceTel',
        data: { heading: 'Areas', roles: ['ADMIN'] },
        loadComponent: () => import('./features/areas/areas-page').then((m) => m.AreasPage),
      },
      {
        path: 'messages',
        title: 'Messages · AllianceTel',
        data: { heading: 'Messages', roles: ['ADMIN', 'MANAGER'] },
        loadComponent: () => import('./features/messages/messages-page').then((m) => m.MessagesPage),
      },
      {
        path: 'time-clock',
        title: 'Time Clock · AllianceTel',
        data: { heading: 'Time Clock', roles: ['ADMIN', 'BACK_OFFICE'] },
        loadComponent: () => import('./features/time-clock/time-clock-page').then((m) => m.TimeClockPage),
      },
      {
        path: 'profile',
        title: 'My Profile · AllianceTel',
        data: { heading: 'My Profile' },
        loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
      },
      {
        path: 'stores',
        title: 'Stores · AllianceTel',
        data: { heading: 'Stores', roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
        loadComponent: () => import('./features/stores/stores-page').then((m) => m.StoresPage),
      },
      {
        // Any other address: signed-in users see a "not found" page; signed-out users go to sign-in first.
        path: '**',
        title: 'Page not found · AllianceTel',
        data: { heading: 'Page not found' },
        loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
