import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from './models';
import { AuthService } from './auth.service';

/** Signed in, and not still on a temporary password. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.token()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  if (auth.user()?.mustChangePassword) {
    return router.createUrlTree(['/change-password']);
  }
  return true;
};

/** Route data `roles: Role[]` limits a page to those roles; others are sent to their home page. */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const roles = (route.data['roles'] as Role[] | undefined) ?? [];
  return roles.length === 0 || auth.hasRole(...roles) ? true : inject(Router).parseUrl(auth.homeUrl());
};

/** The login page is only for people who are not signed in. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (!auth.token()) {
    return true;
  }
  return inject(Router).parseUrl(auth.user()?.mustChangePassword ? '/change-password' : auth.homeUrl());
};

export const signedInGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.token() ? true : inject(Router).parseUrl('/login');
};
