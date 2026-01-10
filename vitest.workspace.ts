import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/client',
  'packages/shared',
  './vitest.config.convex.ts',
]);
