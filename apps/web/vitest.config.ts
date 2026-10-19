import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  // Plugin oficial de React: compila el JSX con el runtime automático (React 17+).
  // Sin él, los tests de componentes fallaban con "React is not defined".
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts', './tests/setup.dom.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    hookTimeout: 20000,
    testTimeout: 20000,
    // Los tests de componentes necesitan DOM.
    environmentMatchGlobs: [['tests/components/**', 'jsdom']],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
