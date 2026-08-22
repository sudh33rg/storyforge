import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.storyforge'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/extension/**'],
    },
  },
  resolve: {
    alias: {
      '@intelligence': path.resolve(__dirname, 'src/intelligence'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@extension': path.resolve(__dirname, 'src/extension'),
      '@alm': path.resolve(__dirname, 'src/alm'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      vscode: path.resolve(__dirname, 'tests/__mocks__/vscode.ts'),
    },
  },
});
