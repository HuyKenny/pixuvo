import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: { 'cloudflare:workers': new URL('./tests/stubs/cloudflare-workers.ts', import.meta.url).pathname } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
  },
});
