import { defineConfig } from 'vite';

// Relative base: the built game runs from any folder or a USB stick, without a server path.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  // In development, /api goes to the Worker run by `npx wrangler dev` (port 8787 unless PATCHBAY_API says otherwise).
  server: { proxy: { '/api': { target: process.env.PATCHBAY_API ?? 'http://127.0.0.1:8787', changeOrigin: false } } },
});
