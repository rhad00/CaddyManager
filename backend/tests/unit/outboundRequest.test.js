/**
 * Outbound alert requests cannot be pointed at internal addresses (MODERNIZATION.md 0.21).
 */
const dns = require('dns');

jest.mock('axios', () => jest.fn());
const axios = require('axios');
const { checkOutboundUrl, guardedLookup, sendOutbound, OutboundUrlError } = require('../../src/utils/outboundRequest');

const lookupResult = (addresses) => (hostname, options, callback) => callback(null, addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));

afterEach(() => {
  jest.restoreAllMocks();
  axios.mockReset();
  delete process.env.ALERT_WEBHOOK_ALLOW_PRIVATE;
});

describe('checkOutboundUrl', () => {
  test.each([
    'https://hooks.slack.com/services/T/B/x',
    'http://alerts.example.com:8080/hook',
  ])('accepts %s', (url) => {
    expect(() => checkOutboundUrl(url)).not.toThrow();
  });

  test.each([
    ['a non-HTTP scheme', 'file:///etc/passwd'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['loopback by name', 'http://localhost:2019/load'],
    ['loopback IPv6', 'http://[::1]:2019/'],
    ['a private address', 'http://10.0.0.5/hook'],
    ['garbage', 'not a url'],
  ])('rejects %s', (_label, url) => {
    expect(() => checkOutboundUrl(url)).toThrow(OutboundUrlError);
  });

  test('ALERT_WEBHOOK_ALLOW_PRIVATE allows private ranges but never link-local or loopback', () => {
    process.env.ALERT_WEBHOOK_ALLOW_PRIVATE = 'true';
    expect(() => checkOutboundUrl('http://10.0.0.5/hook')).not.toThrow();
    expect(() => checkOutboundUrl('http://169.254.169.254/')).toThrow(OutboundUrlError);
    expect(() => checkOutboundUrl('http://127.0.0.1:2019/')).toThrow(OutboundUrlError);
  });
});

describe('guardedLookup (checked at connection time, so DNS cannot be swapped later)', () => {
  test('refuses a name that resolves to an internal address', (done) => {
    jest.spyOn(dns, 'lookup').mockImplementation(lookupResult(['93.184.216.34', '10.1.2.3']));
    guardedLookup('mixed.example.com', { all: true }, (err) => {
      expect(err).toBeInstanceOf(OutboundUrlError);
      done();
    });
  });

  test('passes public addresses through, in both result shapes', (done) => {
    jest.spyOn(dns, 'lookup').mockImplementation(lookupResult(['93.184.216.34']));
    guardedLookup('public.example.com', { all: false }, (err, address, family) => {
      expect(err).toBeNull();
      expect([address, family]).toEqual(['93.184.216.34', 4]);
      guardedLookup('public.example.com', { all: true }, (err2, addresses) => {
        expect(addresses).toEqual([{ address: '93.184.216.34', family: 4 }]);
        done();
      });
    });
  });
});

describe('sendOutbound', () => {
  test('does not follow redirects, times out and resolves through the guard', async () => {
    axios.mockResolvedValue({ status: 200 });

    await sendOutbound({ url: 'https://hooks.example.com/x', data: { a: 1 } });

    expect(axios).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://hooks.example.com/x',
      method: 'POST',
      maxRedirects: 0,
      timeout: expect.any(Number),
      lookup: guardedLookup,
    }));
  });

  test('refuses an internal URL without sending anything', async () => {
    await expect(sendOutbound({ url: 'http://169.254.169.254/' })).rejects.toThrow(OutboundUrlError);
    expect(axios).not.toHaveBeenCalled();
  });
});
