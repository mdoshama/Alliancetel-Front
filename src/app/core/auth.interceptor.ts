import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Adds the bearer token to API calls and sends the user back to sign-in when it is no longer accepted. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = req.url.startsWith('/api/') ? auth.token() : null;
  const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((err: HttpErrorResponse) => {
      const isLogin = req.url.endsWith('/api/auth/login');
      if (err.status === 401 && !isLogin && auth.isLoggedIn()) {
        auth.logout('expired');
      } else if (err.status === 403 && auth.user()?.mustChangePassword) {
        router.navigate(['/change-password']);
      }
      return throwError(() => err);
    }),
  );
};
