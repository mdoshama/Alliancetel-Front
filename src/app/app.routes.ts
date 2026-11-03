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
        data: { heading: 'Weekly Schedule', employeeHeading: 'My Schedule' },
        loadComponent: () => import('./features/schedule/schedule-page').then((m) => m.SchedulePage),
      },
      {
        path: 'eod',
        title: 'End of Day · AllianceTel',
        data: { heading: 'End of Day' },
        loadComponent: () => import('./features/eod/eod-page').then((m) => m.EodPage),
      },
      {
        path: 'day-off-requests',
        title: 'Day-off Requests · AllianceTel',
        data: { heading: 'Day-off Requests', employeeHeading: 'My Days Off' },
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
        path: 'performance',
        title: 'Performance · AllianceTel',
        data: { heading: 'Performance', roles: ['ADMIN', 'MANAGER'] },
        loadComponent: () => import('./features/performance/performance-page').then((m) => m.PerformancePage),
      },
      {
        path: 'performance/employees/:id',
        title: 'Employee performance · AllianceTel',
        data: { heading: 'Employee performance', roles: ['ADMIN', 'MANAGER'] },
        loadComponent: () =>
          import('./features/performance/employee-performance-page').then((m) => m.EmployeePerformancePage),
      },
      {
        path: 'my-performance',
        title: 'My Performance · AllianceTel',
        data: { heading: 'My Performance' },
        loadComponent: () =>
          import('./features/performance/employee-performance-page').then((m) => m.EmployeePerformancePage),
      },
      {
        path: 'commission',
        title: 'Commission · AllianceTel',
        data: { heading: 'Commission', roles: ['ADMIN'] },
        loadComponent: () => import('./features/commission/commission-page').then((m) => m.CommissionPage),
      },
      {
        path: 'devices',
        title: 'Devices · AllianceTel',
        data: { heading: 'Devices', roles: ['ADMIN'] },
        loadComponent: () => import('./features/devices/devices-page').then((m) => m.DevicesPage),
      },
      {
        path: 'messages',
        title: 'Messages · AllianceTel',
        data: { heading: 'Messages', roles: ['ADMIN', 'MANAGER'] },
        loadComponent: () => import('./features/messages/messages-page').then((m) => m.MessagesPage),
      },
      {
        path: 'stores',
        title: 'Stores · AllianceTel',
        data: { heading: 'Stores' },
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
