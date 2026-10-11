
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react-swc';
  import tailwindcss from '@tailwindcss/vite';
  import { VitePWA } from 'vite-plugin-pwa';
  import path from 'path';
  import fs from 'fs';

  // Read version from tauri.conf.json (canonical source), fall back to package.json
  const tauriConf = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'src-tauri/tauri.conf.json'), 'utf-8'));
  const APP_VERSION = tauriConf.version || JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')).version;

  export default defineConfig({
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null, // We register manually to skip in Capacitor/Tauri
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-css',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
        },
        manifest: {
          name: 'The Timeboxing Club',
          short_name: 'Timebox',
          description: 'Plan your day with timeboxing',
          start_url: '/',
          display: 'standalone',
          background_color: '#FDFDFB',
          theme_color: '#8DA286',
          orientation: 'any',
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
      }),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
    },
    server: {
      port: process.env.PORT ? parseInt(process.env.PORT) : 3005,
      open: true,
    },
  });