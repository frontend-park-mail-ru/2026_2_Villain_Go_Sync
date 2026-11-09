import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://localhost:8001', headless: true },
  webServer: {
    command: 'npm run dev -- --port 8001',
    url: 'http://localhost:8001',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
