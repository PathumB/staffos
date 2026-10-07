import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // Single .env at the repo root (CLAUDE.md §17).
  const env = loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), '');
  const apiUrl = env.API_URL || 'http://localhost:3000';

  return {
    plugins: [react(), tailwindcss()],
    // VITE_* variables also come from the root .env.
    envDir: '../..',
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
      // Use @staffos/shared's TypeScript source directly (fast HMR, no build step).
      conditions: ['source', ...defaultClientConditions],
    },
    server: {
      port: 5173,
      strictPort: true,
      // Same-origin rule (CLAUDE.md §4): the browser only ever calls /api on its own origin.
      // In production the Vercel rewrite in vercel.json does the same job.
      proxy: { '/api': { target: apiUrl, changeOrigin: true } },
    },
    build: { sourcemap: true },
    test: {
      environment: 'jsdom',
      // Worker threads start faster than forked processes; on slow Windows disks (antivirus
      // scanning node_modules) forks hit Vitest's worker start-up timeout.
      pool: 'threads',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
