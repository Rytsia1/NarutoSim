import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'NarutoSim: Shinobi Life Chronicle',
        short_name: 'NarutoSim',
        description: 'A text-driven solo shinobi life simulation with recurring wars and dynamic Kizuna.',
        theme_color: '#11100e',
        background_color: '#11100e',
        display: 'standalone',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@sim': path.resolve(__dirname, 'src/sim'),
      '@data': path.resolve(__dirname, 'src/data'),
      '@ui': path.resolve(__dirname, 'src/ui'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor-react';
          }
          if (id.includes('/src/data/') || id.includes('\\src\\data\\')) {
            return 'sim-data';
          }
          if (id.includes('/src/sim/') || id.includes('\\src\\sim\\')) {
            return 'sim-core';
          }
          return undefined;
        },
      },
    },
  },
});
