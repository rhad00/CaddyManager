/**
 * Creates the DNS A records of Cloudflare proxies, so nobody has to add them by hand.
 *
 * The zone of a domain is found with the API token (the longest suffix of the domain that
 * Cloudflare has as a zone), so nothing needs configuring besides CF_API_TOKEN. The token needs
 * Zone:Read and DNS:Edit. Records are only ever created: one that exists with another address
 * is reported, never overwritten.
 *
 * Env: PUBLIC_IP (address of this server; detected through api.ipify.org when unset),
 *      CF_DNS_PROXIED=false (never use the orange cloud), CF_DNS_AUTO=false (switch off).
 * The orange cloud is on by default, except when the record points to a private address
 * (RFC1918, CGNAT, ...): Cloudflare cannot reach it, so such a record is DNS only.
 */
import net from 'net';
import axios from 'axios';
import { errorMessage } from '../utils/errorMessage';
import { isPrivateAddress, isRestrictedHost } from '../utils/ssrf';

const API = 'https://api.cloudflare.com/client/v4';
const IP_LOOKUP_URL = 'https://api.ipify.org';
const TIMEOUT_MS = 10000;

export interface CloudflareZone { id: string; name: string }

export type DnsStatus = 'created' | 'exists' | 'conflict' | 'no_zone' | 'skipped' | 'failed';

export interface DnsResult {
  domain: string;
  status: DnsStatus;
  message?: string;
  zone?: string;
  content?: string;
  proxied?: boolean;
}

interface CfRecord { id: string; type: string; content: string }

let cachedIp: string | null = null;
export function _resetIpCache(): void { cachedIp = null; }

const token = (): string | undefined => process.env.CF_API_TOKEN || undefined;

export function isDnsAutomationEnabled(): boolean {
  return Boolean(token()) && process.env.CF_DNS_AUTO !== 'false';
}

const requestConfig = (params?: Record<string, string>) => ({
  headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
  timeout: TIMEOUT_MS,
  maxRedirects: 0,
  ...(params ? { params } : {}),
});

function cloudflareError(err: unknown): string {
  const data = (err as { response?: { data?: { errors?: Array<{ message?: string }> } } }).response?.data;
  const messages = data?.errors?.map((e) => e.message).filter(Boolean);
  return messages && messages.length > 0 ? messages.join('; ') : errorMessage(err);
}

/** The public IPv4 address records point to */
async function serverIp(): Promise<string> {
  const configured = process.env.PUBLIC_IP?.trim();
  if (configured) {
    if (net.isIPv4(configured)) return configured;
    throw new Error('PUBLIC_IP is not an IPv4 address');
  }
  if (cachedIp) return cachedIp;
  const res = await axios.get(IP_LOOKUP_URL, { timeout: TIMEOUT_MS, maxRedirects: 0, responseType: 'text' });
  const detected = String(res.data).trim();
  if (!net.isIPv4(detected)) throw new Error('Could not detect the public IP of this server; set PUBLIC_IP');
  cachedIp = detected;
  return detected;
}

/** The Cloudflare zone a domain belongs to: the longest suffix of the name that is a zone */
export async function findZone(domain: string): Promise<CloudflareZone | null> {
  const labels = domain.replace(/^\*\./, '').toLowerCase().split('.');
  for (let i = 0; i <= labels.length - 2; i++) {
    const candidate = labels.slice(i).join('.');
    const res = await axios.get(`${API}/zones`, requestConfig({ name: candidate }));
    const zone = (res.data.result as CloudflareZone[] | undefined)?.[0];
    if (zone) return { id: zone.id, name: zone.name };
  }
  return null;
}

/** Orange cloud: on for a public target, never for an internal one, and CF_DNS_PROXIED=false opts out */
export function shouldProxy(ip: string): boolean {
  if (isPrivateAddress(ip) || isRestrictedHost(ip)) return false;
  return process.env.CF_DNS_PROXIED !== 'false';
}

/** Create the A record of `name` unless it exists already */
export async function ensureARecord(zone: CloudflareZone, name: string, ip: string): Promise<DnsResult> {
  const proxied = shouldProxy(ip);
  const base = { domain: name, zone: zone.name, content: ip, proxied };
  const listed = await axios.get(`${API}/zones/${zone.id}/dns_records`, requestConfig({ name }));
  const records = (listed.data.result as CfRecord[] | undefined) ?? [];

  const same = records.find((r) => r.type === 'A' && r.content === ip);
  if (same) return { ...base, status: 'exists', message: 'A record already points to this server' };

  if (records.length > 0) {
    const other = records[0];
    return {
      ...base,
      status: 'conflict',
      message: `${name} already has a ${other.type} record (${other.content}); left unchanged`,
    };
  }

  await axios.post(
    `${API}/zones/${zone.id}/dns_records`,
    { type: 'A', name, content: ip, ttl: 1, proxied },
    requestConfig(),
  );
  return { ...base, status: 'created', message: `A record ${name} -> ${ip} created${proxied ? ' (proxied)' : ' (DNS only)'}` };
}

const isIpOrLocal = (domain: string): boolean =>
  net.isIP(domain) !== 0 || domain === 'localhost' || !domain.includes('.');

/**
 * Make sure every domain has an A record. Never throws: each domain gets a result, so a
 * Cloudflare problem cannot fail saving a proxy.
 */
export async function ensureRecordsForDomains(domains: string[]): Promise<DnsResult[]> {
  if (!isDnsAutomationEnabled()) {
    const message = token() ? 'Automatic DNS records are switched off (CF_DNS_AUTO=false)' : 'CF_API_TOKEN is not set';
    return domains.map((domain) => ({ domain, status: 'skipped', message }));
  }

  const results: DnsResult[] = [];
  let ip: string | null = null;
  for (const domain of domains) {
    if (isIpOrLocal(domain)) {
      results.push({ domain, status: 'skipped', message: 'Not a public domain name' });
      continue;
    }
    try {
      const zone = await findZone(domain);
      if (!zone) {
        results.push({ domain, status: 'no_zone', message: 'No Cloudflare zone for this domain is visible to the API token' });
        continue;
      }
      ip = ip ?? (await serverIp());
      results.push(await ensureARecord(zone, domain, ip));
    } catch (err) {
      results.push({ domain, status: 'failed', message: cloudflareError(err) });
    }
  }
  return results;
}
