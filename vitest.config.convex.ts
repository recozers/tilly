import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'convex',
    root: './convex',
    include: ['**/*.test.ts'],
    globals: true,
    environment: 'node',
    // Don't use workspace when running this config directly
    workspace: undefined,
    coverage: {
      provider: 'v8',
      include: ['**/*.ts'],
      exclude: ['_generated/**', '**/*.test.ts'],
    },
  },
});
