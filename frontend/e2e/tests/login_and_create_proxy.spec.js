import { test, expect } from '@playwright/test';

test('login and create proxy (intercept /api/*)', async ({ page, baseURL }) => {
  const capturedProxyPosts = [];

  await page.route('**/api/**', async (route, request) => {
    const url = request.url();
    const method = request.method();

    if (url.includes('/api/csrf-token')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ csrfToken: 'csrf-e2e' }) });
    }

    if (url.includes('/api/auth/me')) {
      // Force login page on initial app load.
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false }) });
    }

    if (url.includes('/api/auth/login')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, user: { id: 'u-1', email: 'test@example.com', role: 'admin' } }),
      });
    }

    if (url.includes('/api/proxies') && method === 'POST') {
      capturedProxyPosts.push(request.postData() || '');
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, id: 'proxy-e2e' }) });
    }

    if (url.includes('/api/proxies') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, proxies: [] }) });
    }

    if (url.includes('/api/templates')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, templates: [] }) });
    }

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  await page.goto(baseURL || '/');

  await expect(page.locator('input[name="email"]')).toBeVisible();
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');

  await expect(page.getByRole('heading', { name: 'Proxy Management' })).toBeVisible();

  await page.click('button:has-text("Create New Proxy")');
  await expect(page.locator('#name')).toBeVisible();
  await expect(page.locator('#domains')).toBeVisible();
  await expect(page.locator('#upstream_url')).toBeVisible();
  await page.fill('#name', 'e2e-proxy');
  await page.fill('#domains', 'e2e.example.com');
  await page.fill('#upstream_url', 'http://upstream:8080');
  await page.click('button[type="submit"]');

  await expect.poll(() => capturedProxyPosts.length).toBe(1);

  const payload = JSON.parse(capturedProxyPosts[0]);
  expect(payload.name).toBe('e2e-proxy');
  expect(payload.upstream_url).toBe('http://upstream:8080');
  expect(payload.domains).toContain('e2e.example.com');
});
