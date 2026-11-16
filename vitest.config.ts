import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // 'server-only' lança fora do bundler do Next; nos testes vira no-op.
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    globalSetup: ['tests/setup-global.ts'],
    // beforeAll cria e loga usuários no Supabase local; com vários workers isso pode passar de 10 s.
    hookTimeout: 30_000,
  },
});
