import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from './toast.service';

/** Turns API errors (Spring ProblemDetail) into a readable toast, then rethrows. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // Sign-in and password problems are shown on those pages themselves, and an expired session redirects to sign-in.
      const silent =
        err.status === 401 ||
        ['/api/auth/login', '/api/auth/logout', '/api/auth/change-password', '/api/auth/forgot-password', '/api/auth/me/delete']
          .some((path) => req.url.endsWith(path));
      if (!silent) {
        toast.error(describeError(err));
      }
      return throwError(() => err);
    }),
  );
};

/** Short, plain words for each kind of failure (never a status code). */
const FRIENDLY: Record<number, string> = {
  400: "Something's not right. Check and try again.",
  403: "You don't have access to this.",
  404: 'Not found. It may have been removed.',
  408: 'Taking too long. Try again.',
  409: 'Someone just changed this. Refresh and try again.',
  413: 'Too large to send.',
  429: 'Too many tries. Wait a minute.',
};

export function describeError(err: HttpErrorResponse): string {
  if (err.status === 0) {
    return 'No connection. Check your internet and try again.';
  }
  const body = err.error;
  if (body && typeof body === 'object') {
    const fieldErrors = body['errors'] as Record<string, string> | undefined;
    if (fieldErrors && Object.keys(fieldErrors).length) {
      // The server sends whole sentences, e.g. "Phone must be a valid number, e.g. (619) 555-0142."
      return Object.values(fieldErrors).join(' ');
    }
    // The app's own rules (e.g. "Friday is full…") and access messages are written for people; show them as they are.
    // Not-found and technical messages (ids, JSON, parameter names) are replaced by plain words.
    const detail = typeof body['detail'] === 'string' ? body['detail'].trim() : '';
    if (detail && [403, 409, 429].includes(err.status)) {
      return detail;
    }
  }
  if (err.status >= 500) {
    return 'Something went wrong on our side. Try again.';
  }
  return FRIENDLY[err.status] ?? 'Something went wrong. Try again.';
}
