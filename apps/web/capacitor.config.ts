import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.forgex.app',
  appName: 'ForgeX',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
