const { certificateTimeline } = require('../../src/services/certificateTimeline');

const NOW = Date.UTC(2026, 10, 3, 12);
const inDays = (d) => new Date(NOW + d * 86_400_000).toISOString();
const proxy = (over) => ({ id: 'p', name: 'App', domains: ['a.example.com'], ssl_type: 'acme', tls_status: null, tls_checked_at: null, ...over });
const ok = (domain, days) => ({ domain, ok: true, issuer: "Let's Encrypt", validFrom: inDays(days - 90), validTo: inDays(days) });

describe('certificateTimeline', () => {
  test('sorts by soonest expiry and reports whole days left', () => {
    const rows = certificateTimeline([
      proxy({ id: '1', domains: ['late.example.com'], tls_status: { results: [ok('late.example.com', 60)] } }),
      proxy({ id: '2', domains: ['soon.example.com'], tls_status: { results: [ok('soon.example.com', 5.5)] } }),
    ], NOW);
    expect(rows.map((r) => r.domain)).toEqual(['soon.example.com', 'late.example.com']);
    expect(rows[0]).toMatchObject({ state: 'valid', daysLeft: 5, issuer: "Let's Encrypt" });
  });

  test('expired and failed come before valid ones', () => {
    const rows = certificateTimeline([
      proxy({ id: '1', domains: ['ok.example.com'], tls_status: { results: [ok('ok.example.com', 3)] } }),
      proxy({ id: '2', domains: ['bad.example.com'], tls_status: { results: [{ domain: 'bad.example.com', ok: false, error: 'handshake timeout' }] } }),
      proxy({ id: '3', domains: ['old.example.com'], tls_status: { results: [ok('old.example.com', -2)] } }),
    ], NOW);
    expect(rows.map((r) => r.state)).toEqual(['expired', 'failed', 'valid']);
    expect(rows[1].error).toBe('handshake timeout');
    expect(rows[0].daysLeft).toBeLessThan(0);
  });

  test('a domain never checked, or on a proxy without TLS, is not given a made-up expiry', () => {
    const rows = certificateTimeline([
      proxy({ id: '1', domains: ['new.example.com'] }),
      proxy({ id: '2', domains: ['plain.example.com'], ssl_type: 'none' }),
    ], NOW);
    expect(rows.map((r) => [r.domain, r.state, r.validTo])).toEqual([
      ['new.example.com', 'unchecked', null],
      ['plain.example.com', 'not_used', null],
    ]);
  });

  test('carries the age of the stored check and ignores unparsable dates', () => {
    const checked = new Date(NOW - 3600_000);
    const rows = certificateTimeline([
      proxy({ domains: ['a.example.com', 'b.example.com'], tls_checked_at: checked, tls_status: { results: [ok('a.example.com', 30), { domain: 'b.example.com', ok: true, validTo: 'garbage' }] } }),
    ], NOW);
    expect(rows[0].checkedAt).toBe(checked.toISOString());
    expect(rows.find((r) => r.domain === 'b.example.com')).toMatchObject({ state: 'unchecked', validTo: null });
  });
});
