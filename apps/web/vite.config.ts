import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['forgex_icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'ForgeX AI',
        short_name: 'ForgeX',
        description: 'ForgeX AI — Autonomous Industrial Intelligence Platform',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,mjs,webmanifest}'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/healthz/, /^\/readyz/],
        runtimeCaching: [
          // 1. NEVER cache authentication, session tokens, audit ledger or LOTO safety verification
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/api/auth') ||
              url.pathname.includes('/loto') ||
              url.pathname.includes('/verify') ||
              url.pathname.startsWith('/api/audit') ||
              url.pathname.startsWith('/api/security'),
            handler: 'NetworkOnly',
          },
          // 2. Cache manuals, SOPs, engineering drawings, CAD models opened by technicians (CacheFirst with expiration)
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/api/documents') ||
              url.pathname.startsWith('/api/engineering') ||
              url.pathname.includes('/manuals') ||
              url.pathname.includes('/sops') ||
              /\.(?:pdf|glb|gltf|png|jpg|jpeg|svg|webp)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'forgex-manuals-sops-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days retention for field work
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // 3. NetworkFirst for general API read endpoints (machine status, asset telemetry, procedures)
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              url.pathname.startsWith('/api') &&
              !url.pathname.startsWith('/api/auth') &&
              !url.pathname.includes('/loto'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'forgex-api-reads-cache',
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 24 * 60 * 60, // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['@ricky0123/vad-web', 'onnxruntime-web'],
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    proxy: {
      '/healthz': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
      '/readyz': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
