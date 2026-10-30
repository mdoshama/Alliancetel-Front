import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from './toast.service';

/** Turns API errors (Spring ProblemDetail) into a readable toast, then rethrows. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // Sign-in problems are shown on the login page itself, and an expired session redirects there.
      const silent = err.status === 401 || req.url.endsWith('/api/auth/login');
      if (!silent) {
        toast.error(describeError(err));
      }
      return throwError(() => err);
    }),
  );
};

export function describeError(err: HttpErrorResponse): string {
  if (err.status === 0) {
    return 'Cannot reach the server. Is the backend running on port 8080?';
  }
  const body = err.error;
  if (body && typeof body === 'object') {
    const fieldErrors = body['errors'] as Record<string, string> | undefined;
    if (fieldErrors && Object.keys(fieldErrors).length) {
      // The server sends whole sentences, e.g. "Phone must be a valid number, e.g. (619) 555-0142."
      return Object.values(fieldErrors).join(' ');
    }
    if (typeof body['detail'] === 'string') {
      return body['detail'];
    }
  }
  return `Request failed (${err.status}).`;
}
