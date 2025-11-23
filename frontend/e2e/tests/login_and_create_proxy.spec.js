import { test, expect } from '@playwright/test';

test('login and create proxy (intercept /api/*)', async ({ page, baseURL }) => {
  // Record API calls
  const recorded = [];

  await page.route('**/api/**', async (route, request) => {
    recorded.push({ url: request.url(), method: request.method(), postData: request.postData() });
    // Return a generic successful JSON response for POSTs, and empty object for GETs
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, id: 'fake-id' }) });
    }
  });

  // Navigate to app
  await page.goto(baseURL || '/');

  // Attempt to navigate to login (app may redirect or show login)
  await page.click('text=Login').catch(() => {});

  // If login form exists, fill it (selectors are app-specific; adapt if necessary)
  if (await page.$('input[name="email"]')) {
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password');
    await page.click('button[type="submit"]').catch(() => {});
  }

  // Wait briefly for UI to settle
  await page.waitForTimeout(500);

  // Navigate to proxies page and open create form
  await page.click('text=Proxies').catch(() => {});
  await page.click('text=Create Proxy').catch(() => {});

  // Try to fill common fields in create form if present
  if (await page.$('input[name="name"]')) {
    await page.fill('input[name="name"]', 'e2e-proxy');
  }
  if (await page.$('input[name="domains"]')) {
    await page.fill('input[name="domains"]', 'e2e.example.com');
  }
  if (await page.$('input[name="upstream_url"]')) {
    await page.fill('input[name="upstream_url"]', 'http://upstream:8080');
  }

  // Submit the form (best-effort selectors)
  await page.click('button[type="submit"]').catch(() => {});

  // Wait for a POST request to /api/proxies (or generic /api/.. create endpoint)
  let req;
  try {
    req = await page.waitForRequest((r) => r.url().includes('/api/proxies') && r.method() === 'POST', { timeout: 3000 });
  } catch (err) {
    // fallback: search recorded requests
    console.log('error waiting for request:', err);
    req = recorded.find(r => r.url.includes('/api/proxies') && r.method === 'POST');
  }

  expect(req, 'Expected a POST to /api/proxies').toBeTruthy();
  // Parse posted JSON payload from Playwright Request or recorded fallback
  let payload = null;
  try {
    // Playwright Request object exposes postData() method
    if (req.postData && typeof req.postData === 'function') {
      const raw = await req.postData();
      payload = raw ? JSON.parse(raw) : null;
    } else if (req.postData) {
      // recorded fallback where postData is a string
      payload = req.postData ? JSON.parse(req.postData) : null;
    } else if (req.postDataJSON) {
      payload = typeof req.postDataJSON === 'function' ? await req.postDataJSON() : req.postDataJSON;
    }
  } catch {
    payload = null;
  }

  // Assert expected fields exist in payload
  expect(payload, 'Expected JSON payload in POST body').toBeTruthy();
  expect(payload).toHaveProperty('name');
  expect(payload).toHaveProperty('upstream_url');
  // domains may be array or comma-separated string
  expect(payload).toHaveProperty('domains');
  if (Array.isArray(payload.domains)) {
    expect(payload.domains).toContain('e2e.example.com');
  } else if (typeof payload.domains === 'string') {
    expect(payload.domains).toMatch(/e2e.example.com/);
  }
});
