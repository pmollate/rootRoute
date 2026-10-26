import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for the dashboard (components/dashboard, lib). The landing page has no tests here.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['components/**/*.test.tsx', 'lib/**/*.test.ts'] },
});
