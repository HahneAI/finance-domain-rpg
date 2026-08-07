/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    VitePWA({
      // 'prompt' (not 'autoUpdate'): with skipWaiting/clientsClaim below, an
      // 'autoUpdate' registration force-reloads every open tab the instant a new
      // deploy's service worker activates — no warning, no coordination with
      // in-flight app state. On a frequently-redeploying preview branch that fired
      // mid-session, wiping unsaved goal/expense edits and unconfirmed weekly
      // check-ins. 'prompt' leaves the reload to an explicit user action
      // (main.jsx's onNeedRefresh → UpdateAvailableBanner) instead.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Authority Finance',
        short_name: 'A:Fin',
        description: 'Personal finance dashboard — DHL/P&G Jackson MO',
        theme_color: '#0d0d0d',
        background_color: '#0d0d0d',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Take control on the next load instead of waiting for every tab to close,
        // and drop stale precaches so a new deploy doesn't keep serving the old bundle.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Always revalidate the app shell against the network so a fresh deploy's
        // index.html (and the new hashed bundle it references) loads on next visit.
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // App navigations: network-first so new builds win, falling back to cache offline.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // TEMPORARY (docs/TODO.md — remove after the Changelog admin crash is root-
  // caused): production stack traces are otherwise minified into unreadable
  // names (yx/ho/oc/...), which made an actual render crash impossible to
  // diagnose from a mobile-only device with no devtools access. Exposes full
  // readable source (incl. code comments) via browser devtools until reverted.
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/constants/**', 'src/hooks/**', 'src/components/**'],
    },
  },
})
