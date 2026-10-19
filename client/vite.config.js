import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The browser only ever talks to its own origin; Vite forwards /api to the
    // Express process. That means no CORS in dev and no API base URL in the
    // bundle, so the same build works behind any host.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  optimizeDeps: {
    // @invoice/shared is a workspace symlink, not a published package — let
    // Vite transform it from source instead of pre-bundling it.
    exclude: ['@invoice/shared'],
  },
});
