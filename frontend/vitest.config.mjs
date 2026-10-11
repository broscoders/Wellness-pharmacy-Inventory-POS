import { defineConfig } from 'vitest/config';
import path from 'node:path';

// The app's .js files contain JSX (normal for Next.js), so tell the test transformer to read them that way.
export default defineConfig({
  esbuild: { loader: 'jsx', include: /\/(app|components|context|lib|tests)\/.*\.(js|jsx)$/, exclude: /node_modules/, jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.jsx'], setupFiles: ['tests/setup.js'], restoreMocks: true },
});
