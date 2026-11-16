import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
    env: { EXTRACAO_MODO: 'fake' },
  },
  use: { baseURL: 'http://localhost:3000' },
});
