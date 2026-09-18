import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative base so the same build works from a local preview and from a
  // GitHub Pages project sub-path (/<repo>/) without extra configuration.
  base: './',
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', sourcemap: true },
});
