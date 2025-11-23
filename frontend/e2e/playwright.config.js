// Playwright config scaffold for frontend E2E tests (ESM)
import { devices } from '@playwright/test';
// Note: avoid loading dotenv here; Playwright tests will use environment variables provided by the environment.

export default {
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  use: {
    baseURL: globalThis.process?.env?.E2E_BASE_URL || 'http://localhost:5173',
    headless: true,
    viewport: { width: 1280, height: 720 }
  }
};
