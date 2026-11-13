import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native iOS / Android shell around the Angular app.
 * Build the web app first (`npm run build`), then `npx cap sync` copies it into ios/ and android/.
 *
 * appId is the store identity (App Store bundle ID / Play package name). It can't be changed once the app is
 * published, so change it here before the first upload if needed.
 */
const config: CapacitorConfig = {
  appId: 'app.atdirect.alliancetel',
  appName: 'AllianceTel',
  webDir: 'dist/scheduling-software-frontend/browser',
  ios: {
    contentInset: 'never',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
