import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { TAB_ID } from './live.service';

/** Adds the bearer token to API calls and sends the user back to sign-in when it is no longer accepted. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = req.url.startsWith('/api/') ? auth.token() : null;
  const isApi = req.url.startsWith('/api/');
  // The tab id lets the server skip sending our own changes back to us as live updates.
  const headers: Record<string, string> = isApi ? { 'X-Client-Id': TAB_ID } : {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const request = Object.keys(headers).length ? req.clone({ setHeaders: headers }) : req;

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
