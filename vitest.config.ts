import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', testTimeout: 10000, hookTimeout: 15000, fileParallelism: false },
});
