import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

// `npm run dev:phone` (mode "phone") serves the dev site over HTTPS on the
// local network with a self-signed certificate, because browsers only
// allow GPS on https or localhost. Used to test a real phone as the driver.
export default defineConfig(({ mode }) => ({
  plugins: [
    ...(mode === 'phone' ? [basicSsl()] : []),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Transtrack Kenya',
        short_name: 'Transtrack',
        description: 'Transport management and live tracking for universities, schools and companies across Kenya.',
        theme_color: '#f8fafc',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache-first for the built app shell (JS/CSS/fonts/icons).
        // Live data (auth, GPS, payments) always goes over the network —
        // it is never cached, since serving stale bus locations would be
        // actively misleading rather than just an inconvenience.
        // API responses are tenant- and user-specific, so none are cached:
        // a URL-keyed cache could show one organisation's data to another
        // user of the same device. API and auth navigations (e.g. Google's
        // redirect-mode sign-in post) always go to the network.
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  // Production builds drop console/debugger calls.
  esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : {},
  build: {
    // Only React is split out by hand (shared by every page, cached across
    // deploys). Maps, charts and the rest follow the lazily loaded pages
    // that use them, so they are not downloaded up front.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
      },
    },
  },
}))
