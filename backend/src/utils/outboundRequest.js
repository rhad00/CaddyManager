/**
 * Outbound HTTP requests to admin-configured URLs (alert webhooks) without SSRF.
 *
 * Two checks, because neither is enough alone:
 * - checkOutboundUrl: the URL itself (scheme, IP-literal host). Node does not call `lookup`
 *   for IP literals, so they must be checked here.
 * - guardedLookup: every address a host name resolves to, at connection time, so a DNS
 *   answer cannot be swapped between a check and the connect (rebinding).
 * Redirects are not followed, since a redirect target would bypass the URL check.
 *
 * ALERT_WEBHOOK_ALLOW_PRIVATE=true permits private ranges for internal receivers;
 * loopback, link-local (cloud metadata) and the other always-blocked ranges stay blocked.
 */
const dns = require('dns');
const net = require('net');
const axios = require('axios');
const { isRestrictedHost } = require('./ssrf');

const TIMEOUT_MS = 10000;

class OutboundUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OutboundUrlError';
  }
}

// Private ranges that ALERT_WEBHOOK_ALLOW_PRIVATE may open up
const PRIVATE = new net.BlockList();
PRIVATE.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE.addSubnet('192.168.0.0', 16, 'ipv4');
PRIVATE.addSubnet('100.64.0.0', 10, 'ipv4');
PRIVATE.addSubnet('fc00::', 7, 'ipv6');

const isPrivateAddress = (host) => {
  const family = net.isIP(host);
  return family !== 0 && PRIVATE.check(host, family === 4 ? 'ipv4' : 'ipv6');
};

/** @param {string} host - name or IP literal (no brackets) */
function isBlockedDestination(host) {
  if (!isRestrictedHost(host)) return false;
  return !(process.env.ALERT_WEBHOOK_ALLOW_PRIVATE === 'true' && isPrivateAddress(host));
}

/**
 * @param {string} raw
 * @returns {URL}
 * @throws {OutboundUrlError}
 */
function checkOutboundUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new OutboundUrlError('URL is not valid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OutboundUrlError('URL must use http or https');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedDestination(host)) {
    throw new OutboundUrlError(`URL points to a restricted (internal) address: ${host}`);
  }
  return url;
}

/** dns.lookup-compatible resolver that refuses restricted addresses. */
function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const blocked = addresses.find((a) => isBlockedDestination(a.address));
    if (blocked) {
      return callback(new OutboundUrlError(`${hostname} resolves to a restricted (internal) address`));
    }
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

/**
 * @param {{url: string, method?: string, headers?: Object, data?: any}} request
 * @returns {Promise<import('axios').AxiosResponse>}
 */
async function sendOutbound({ url, method = 'POST', headers = {}, data }) {
  checkOutboundUrl(url);
  return axios({ url, method, headers, data, maxRedirects: 0, timeout: TIMEOUT_MS, lookup: guardedLookup });
}

module.exports = { checkOutboundUrl, guardedLookup, sendOutbound, OutboundUrlError };
