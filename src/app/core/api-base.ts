import { HttpInterceptorFn } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';

/**
 * Where the API lives.
 * - On the website the app and the API share a domain (nginx forwards /api), so paths stay relative: ''.
 * - In the iOS / Android app the pages are served from inside the app (capacitor://localhost, https://localhost),
 *   so API calls must go to the real server.
 */
export const NATIVE_API_ORIGIN = 'https://atdirect.app';

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

export const apiOrigin = (): string => (isNativeApp() ? NATIVE_API_ORIGIN : '');

/** A page of the website (terms, privacy): relative on the web, the live site in the app (opens in the browser). */
export function siteUrl(path: string): string {
  return apiOrigin() + path;
}

/** '/api/x' → 'https://atdirect.app/api/x' in the native app; unchanged on the web. */
export function apiUrl(path: string): string {
  return path.startsWith('/api/') || path === '/api' ? apiOrigin() + path : path;
}

/**
 * Runs last, so the other interceptors still see the relative '/api/…' path they check for, and only the request
 * that actually leaves the app gets the full server address.
 */
export const apiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  const url = apiUrl(req.url);
  return next(url === req.url ? req : req.clone({ url }));
};
