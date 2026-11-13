import { apiUrl, siteUrl } from './api-base';

// The website must keep calling its own domain (nginx forwards /api); only the native app uses the full address.
describe('api-base on the website', () => {
  it('leaves API paths relative', () => {
    expect(apiUrl('/api/auth/login')).toBe('/api/auth/login');
    expect(siteUrl('/terms')).toBe('/terms');
  });

  it('never touches non-API URLs', () => {
    expect(apiUrl('https://maps.google.com/?q=x')).toBe('https://maps.google.com/?q=x');
    expect(apiUrl('/apiary')).toBe('/apiary');
  });
});
