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
import dns from 'dns';
import net from 'net';
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { isRestrictedHost, isPrivateAddress } from './ssrf';

const TIMEOUT_MS = 10000;

export class OutboundUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundUrlError';
  }
}

/** @param host - name or IP literal (no brackets) */
function isBlockedDestination(host: string): boolean {
  if (!isRestrictedHost(host)) return false;
  return !(process.env.ALERT_WEBHOOK_ALLOW_PRIVATE === 'true' && isPrivateAddress(host));
}

/** @throws {OutboundUrlError} */
export function checkOutboundUrl(raw: string): URL {
  let url: URL;
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

type LookupCallback = (
  err: Error | null,
  address?: string | dns.LookupAddress[],
  family?: number,
) => void;

/** dns.lookup-compatible resolver that refuses restricted addresses. */
export function guardedLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: LookupCallback,
): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const resolved = addresses as dns.LookupAddress[];
    const blocked = resolved.find((a) => isBlockedDestination(a.address));
    if (blocked) {
      return callback(new OutboundUrlError(`${hostname} resolves to a restricted (internal) address`));
    }
    if (options.all) return callback(null, resolved);
    return callback(null, resolved[0].address, resolved[0].family);
  });
}

export interface OutboundRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  data?: unknown;
}

export async function sendOutbound({
  url,
  method = 'POST',
  headers = {},
  data,
}: OutboundRequest): Promise<AxiosResponse> {
  checkOutboundUrl(url);
  return axios({ url, method, headers, data, maxRedirects: 0, timeout: TIMEOUT_MS, lookup: guardedLookup as AxiosRequestConfig['lookup'] });
}
