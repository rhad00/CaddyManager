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

  // The menu is a tree: open the submenu (Settings > My account is two levels deep), then follow the link
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const openSubmenu = async (name) => {
    const button = nav.getByRole('button', { name, exact: true });
    if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
  };

  const pageAssertions = [
    { path: ['Routing'], link: 'Templates', heading: 'Service Templates' },
    { path: ['Operations'], link: 'Backup and restore', heading: 'Backup & Restore' },
    { path: ['Monitoring'], link: 'Metrics', heading: 'Caddy metrics' },
    { path: ['Monitoring'], link: 'Audit log', heading: 'Audit Logs' },
    { path: ['Routing'], link: 'Docker discovery', heading: 'Discovered Services' },
    { path: ['Operations'], link: 'Git and GitOps', heading: 'Git Integration & GitOps' },
    { path: ['Monitoring'], link: 'Access logs', heading: 'Access Log Viewer' },
    { path: ['Monitoring'], link: 'Alerts', heading: 'Alerting & Notifications' },
    { path: ['Settings', 'My account'], link: 'API keys', heading: 'My Account' },
    { path: ['Settings'], link: 'Users', heading: 'User Management' },
  ];

  for (const { path, link, heading } of pageAssertions) {
    for (const submenu of path) await openSubmenu(submenu);
    const item = nav.getByRole('link', { name: link, exact: true });
    await item.click();
    await expect(item).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }

  // The hamburger folds the menu away and back
  await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(nav).toBeHidden();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(nav).toBeVisible();

  // The old address of the users page still works
  await page.goto('/users');
  await expect(page).toHaveURL(/\/settings\/users$/);
  await expect(page.getByRole('heading', { name: 'User Management', exact: true })).toBeVisible();
});
