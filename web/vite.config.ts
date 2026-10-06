/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',           // never swap versions under the user; show "Reload" banner
      injectRegister: null,             // registered from src/components/UpdatePrompt.tsx
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'DCU Active',
        short_name: 'DCU Active',
        description: 'Book DCU sports facilities.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f7f9',
        theme_color: '#0b5cad',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the built static app shell is precached.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Never cache backend traffic: availability and bookings must always be live.
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/auth/') || url.pathname.startsWith('/rest/') || url.pathname.startsWith('/realtime/'), handler: 'NetworkOnly' },
        ],
        navigateFallbackDenylist: [/^\/auth\/v1\//, /^\/rest\/v1\//],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
