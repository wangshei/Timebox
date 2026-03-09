import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'club.timeboxing.app',
  appName: 'Timebox',
  webDir: 'dist',
  server: {
    // Uncomment for live reload during development:
    // url: 'http://YOUR_IP:5173',
    // cleartext: true,
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'Timebox',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#FDFDFB',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#FCFBF7',
    },
  },
};

export default config;
