Frontend E2E tests (Playwright)

Quick setup (local):

1. Install Playwright and browsers:

```bash
cd frontend
npm install -D @playwright/test
npx playwright install
```

2. Add a script to `package.json`:

```json
"scripts": {
  "e2e": "playwright test --config e2e/playwright.config.js"
}
```

3. Start the frontend dev server and run tests (in separate terminals):

```bash
cd frontend
npm run dev
# In another terminal
npm run e2e
```

Notes:
- The test is a scaffold and uses best-effort selectors. Update selectors to match the real app.
- For CI, run Playwright in headed/headless mode as appropriate and consider spinning up the backend+mock services.

Additional notes (session 2025-11-23):
- The scaffolded E2E test intercepts `**/api/**` requests and returns fake JSON responses so tests run without a backend.
- The test asserts that a POST to `/api/proxies` is made and validates that the request payload includes `name`, `upstream_url`, and `domains`.
- To make tests more robust, add `data-testid` attributes to the frontend form fields and update the test selectors accordingly.
