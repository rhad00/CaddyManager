// Playwright config scaffold for frontend E2E tests (ESM)
import { devices } from '@playwright/test';
// Note: avoid loading dotenv here; Playwright tests will use environment variables provided by the environment.

export default {
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 5000 },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  fullyParallel: true,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  use: {
    baseURL: globalThis.process?.env?.E2E_BASE_URL || 'http://127.0.0.1:5173',
    headless: true,
    viewport: { width: 1280, height: 720 }
  }
};
