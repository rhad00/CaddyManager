/**
 * A rule that fires leaves an event behind; old events are pruned.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { sequelize, Proxy, User, AlertRule, AlertEvent } = require('../../src/models');
const { runAlertChecks } = require('../../src/services/alertService');
const { pruneAlertEvents, recentAlertEvents } = require('../../src/services/alertEvents');

let proxy;
beforeAll(async () => {
  await sequelize.sync({ force: true });
  const user = await User.create({ email: 'a@example.com', password_hash: 'x'.repeat(60), role: 'admin' });
  // Nothing listens on port 1, so the connection is refused at once
  proxy = await Proxy.create({ name: 'Down app', domains: ['down.example.com'], upstream_url: 'http://127.0.0.1:1', ssl_type: 'none', created_by: user.id });
  await AlertRule.create({ name: 'Upstream check', condition_type: 'upstream_down', proxy_id: proxy.id, channel_ids: [], cooldown_minutes: 60, enabled: true });
});
afterAll(async () => { try { await sequelize.close(); } catch { /* already closed */ } });

test('a rule that fires is recorded with the names as they were and what it found', async () => {
  await runAlertChecks();

  const events = await recentAlertEvents(Date.now() - 60_000);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ ruleName: 'Upstream check', conditionType: 'upstream_down', proxyName: 'Down app', proxyId: proxy.id });
  expect(events[0].summary).toMatch(/127\.0\.0\.1:1/);
});

test('events survive the proxy being renamed, and only events past the retention are pruned', async () => {
  await proxy.update({ name: 'Renamed' });
  await AlertEvent.create({
    fired_at: new Date(Date.now() - 100 * 86_400_000), rule_id: 'x', rule_name: 'Old', condition_type: 'no_traffic', proxy_id: proxy.id, proxy_name: 'Old', summary: 'old',
  });

  expect(await pruneAlertEvents()).toBe(1);
  const events = await recentAlertEvents(Date.now() - 86_400_000);
  expect(events).toHaveLength(1);
  expect(events[0].proxyName).toBe('Down app');
});
