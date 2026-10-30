import { defineConfig } from 'vitest/config';

// Integration tests share one real Postgres database (row-level security
// cannot be mocked), so test files run one at a time.
export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/globalSetup.js',
    setupFiles: ['./tests/setupEnv.js'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
