import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      util: path.resolve(__dirname, './utils/util-polyfill.ts'),
      events: path.resolve(__dirname, './utils/events-polyfill.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'pdf-vendor': ['pdfjs-dist'],
          'capacitor-vendor': ['@capacitor/core', '@capacitor/app', '@capacitor/filesystem', '@capacitor/preferences', '@capacitor/splash-screen'],
          'archive-vendor': ['jszip', 'libarchive.js']
        }
      }
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  }
});