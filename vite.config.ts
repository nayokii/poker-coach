import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Development only: lets a temporary HTTPS tunnel (npm run dev:tunnel) reach the dev/preview servers.
// Cloudflare quick tunnels use random <name>.trycloudflare.com hosts, which Vite blocks by default.
const tunnelHosts = ['.trycloudflare.com'];
const viaTunnel = process.env.POKER_TUNNEL === '1';

export default defineConfig({
  server: {
    allowedHosts: tunnelHosts,
    // Behind the HTTPS tunnel the browser must reach the HMR websocket on port 443 over wss.
    hmr: viaTunnel ? { clientPort: 443, protocol: 'wss' } : undefined,
  },
  preview: { allowedHosts: tunnelHosts },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Poker Coach',
        short_name: 'Poker Coach',
        description: 'Entraînement Texas Hold\'em No-Limit, sans argent réel.',
        lang: 'fr',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        theme_color: '#0B0D10',
        background_color: '#0B0D10',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'] },
    }),
  ],
  test: {
    environment: 'node',
    testTimeout: 20_000,
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    setupFiles: ['src/ui/test/setup.ts'],
  },
});
