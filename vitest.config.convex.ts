import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'convex',
    root: './convex',
    include: ['**/*.test.ts'],
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['**/*.ts'],
      exclude: ['_generated/**', '**/*.test.ts'],
    },
  },
});
