import { test, expect } from '@playwright/test';

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

test('dashboard feature tabs smoke journey', async ({ page, baseURL }) => {
  await page.route('**/api/**', async (route, request) => {
    const url = request.url();
    const method = request.method();

    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204 });
    }

    if (url.endsWith('/api/csrf-token')) {
      return route.fulfill(json({ csrfToken: 'e2e-csrf-token' }));
    }
    if (url.includes('/api/auth/me')) {
      return route.fulfill(json({ user: { id: 'u-1', email: 'admin@example.com', role: 'admin' } }));
    }
    if (url.includes('/api/proxies')) {
      return route.fulfill(json({ success: true, proxies: [] }));
    }
    if (url.includes('/api/templates')) {
      return route.fulfill(json({ success: true, templates: [] }));
    }
    if (url.includes('/api/backups')) {
      return route.fulfill(json({ success: true, backups: [] }));
    }
    if (url.includes('/api/metrics/historical')) {
      return route.fulfill(json({ success: true, metrics: [] }));
    }
    if (url.includes('/api/metrics')) {
      return route.fulfill(json({ success: true, metrics: { http: { responseStatus: {} } } }));
    }
    if (url.includes('/api/audit/logs')) {
      return route.fulfill(json({
        success: true,
        logs: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      }));
    }
    if (url.includes('/api/audit/stats')) {
      return route.fulfill(json({ success: true, stats: { total: 0 } }));
    }
    if (url.includes('/api/audit/actions')) {
      return route.fulfill(json({ success: true, actions: [] }));
    }
    if (url.includes('/api/audit/resources')) {
      return route.fulfill(json({ success: true, resources: [] }));
    }
    if (url.includes('/api/discovery/status')) {
      return route.fulfill(json({ initialized: true, watching: false }));
    }
    if (url.includes('/api/discovery')) {
      return route.fulfill(json({ success: true, services: [] }));
    }
    if (url.includes('/api/git/repositories')) {
      return route.fulfill(json({ success: true, repositories: [] }));
    }
    if (url.includes('/api/git/history')) {
      return route.fulfill(json({ success: true, changes: [] }));
    }
    if (url.includes('/api/logs/stats')) {
      return route.fulfill(json({ success: true, stats: { path: '/tmp/access.log', exists: true, size: 0 } }));
    }
    if (url.includes('/api/logs')) {
      return route.fulfill(json({ success: true, logs: [] }));
    }
    if (url.includes('/api/alerts/channels')) {
      return route.fulfill(json({ success: true, channels: [] }));
    }
    if (url.includes('/api/alerts/rules')) {
      return route.fulfill(json({ success: true, rules: [] }));
    }
    if (url.includes('/api/keys')) {
      return route.fulfill(json({ success: true, keys: [] }));
    }
    if (url.includes('/api/users')) {
      return route.fulfill(json({ success: true, users: [] }));
    }

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return route.fulfill(json({ success: true }));
    }

    return route.fulfill(json({ success: true }));
  });

  await page.goto(baseURL || '/');

  await expect(page.getByText('Proxy Management')).toBeVisible();

  const tabAssertions = [
    { tab: 'Templates', heading: 'Service Templates' },
    { tab: 'Backup & Restore', heading: 'Backup & Restore' },
    { tab: 'Metrics', heading: 'Caddy Metrics Dashboard' },
    { tab: 'Audit Logs', heading: 'Audit Logs' },
    { tab: 'Discovery', heading: 'Discovered Services' },
    { tab: 'Git & GitOps', heading: 'Git Integration & GitOps' },
    { tab: 'Access Logs', heading: 'Access Log Viewer' },
    { tab: 'Alerts', heading: 'Alerting & Notifications' },
    { tab: 'My Account', heading: 'My Account' },
    { tab: 'Users', heading: 'User Management' },
  ];

  for (const { tab, heading } of tabAssertions) {
    const tabButton = page.getByRole('tab', { name: tab, exact: true });
    await tabButton.click();
    await expect(tabButton).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
});