import { defineConfig } from 'vite';

// GitHub Pages serves project sites under /<repo>/; the deploy workflow sets
// BASE_PATH accordingly. Local dev and preview use the root.
export default defineConfig({
  base: process.env['BASE_PATH'] ?? '/',
  build: { target: 'es2022' },
});
