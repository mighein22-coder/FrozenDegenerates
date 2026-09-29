import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': a new version waits until the member taps
      // Reload (PwaNotices), so an update never lands mid-pick and discards an
      // unsaved sheet.
      registerType: 'prompt',
      includeAssets: ['favicon-64.png', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'IcePick - NHL League',
        short_name: 'IcePick',
        description: "The NHL Saturday pick'em pool.",
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // slate-900, the app's page color in dark mode.
        theme_color: '#0f172a',
        background_color: '#0f172a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell only. Inter and Teko ship a file per script; keep the
        // Latin ones (team names carry accents, so latin-ext too) and let the
        // Cyrillic/Greek/Vietnamese files load on demand rather than
        // precaching ~40 files nobody needs.
        globPatterns: ['**/*.{js,css,html,png,svg,ico}', '**/*-latin-*.woff2', '**/*-latin-ext-*.woff2'],
        cleanupOutdatedCaches: true,
        // A refresh or deep link works offline: serve the shell for any page
        // navigation, except the Netlify functions, which are not pages.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/\.netlify\//],
        // Everything dynamic goes to the network, always. Standings, picks and
        // scores go stale in minutes and a cached copy could show a member a
        // sheet that is not what was saved; auth responses must never be
        // stored. Anything not listed here is also uncached (workbox only
        // handles what is precached or routed), so this is explicit rather
        // than load-bearing.
        runtimeCaching: [
          { urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'), handler: 'NetworkOnly' },
          { urlPattern: ({ url }) => url.pathname.startsWith('/.netlify/'), handler: 'NetworkOnly' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
