import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './packages/client/vitest.config.ts',
    test: {
      name: 'client',
      root: './packages/client',
    },
  },
  {
    extends: './packages/shared/vitest.config.ts',
    test: {
      name: 'shared',
      root: './packages/shared',
    },
  },
  {
    test: {
      name: 'convex',
      root: './convex',
      include: ['**/*.test.ts'],
      globals: true,
      environment: 'node',
    },
  },
]);
