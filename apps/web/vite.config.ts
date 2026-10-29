import { defineConfig } from 'vite';

// Relative base: the built game runs from any folder or a USB stick, without a server path.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
