/**
 * Address checks for user-supplied upstreams (SSRF prevention).
 *
 * Uses net.BlockList, which also matches IPv4-mapped IPv6 addresses
 * (e.g. ::ffff:7f00:1) against the IPv4 rules, closing the bypass that
 * hand-written string checks had.
 *
 * Note: this checks the literal host only. A DNS name that resolves to a
 * private address is not caught here.
 */
import net from 'net';

const BLOCKED_NAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.internal',
]);

type Subnet = [prefix: string, bits: number];

const BLOCKED_IPV4_SUBNETS: Subnet[] = [
  ['0.0.0.0', 8],        // "this" network
  ['10.0.0.0', 8],       // private
  ['100.64.0.0', 10],    // CGNAT
  ['127.0.0.0', 8],      // loopback
  ['169.254.0.0', 16],   // link-local, cloud metadata
  ['172.16.0.0', 12],    // private
  ['192.0.2.0', 24],     // TEST-NET-1
  ['192.168.0.0', 16],   // private
  ['198.18.0.0', 15],    // benchmarking
  ['198.51.100.0', 24],  // TEST-NET-2
  ['203.0.113.0', 24],   // TEST-NET-3
  ['240.0.0.0', 4],      // reserved + broadcast
];

const BLOCKED_IPV6_SUBNETS: Subnet[] = [
  ['::', 96],            // unspecified, loopback and deprecated IPv4-compatible (::a.b.c.d)
  ['64:ff9b::', 96],     // NAT64 well-known prefix embeds IPv4 addresses
  ['fc00::', 7],         // unique local
  ['fe80::', 10],        // link-local
];

const blockList = new net.BlockList();
for (const [prefix, bits] of BLOCKED_IPV4_SUBNETS) blockList.addSubnet(prefix, bits, 'ipv4');
for (const [prefix, bits] of BLOCKED_IPV6_SUBNETS) blockList.addSubnet(prefix, bits, 'ipv6');

// Private ranges that the opt-ins (UPSTREAM_ALLOW_PRIVATE, ALERT_WEBHOOK_ALLOW_PRIVATE) may open
// up. Loopback, link-local (cloud metadata) and the other reserved ranges are never in here.
const PRIVATE_SUBNETS: Array<[prefix: string, bits: number, family: 'ipv4' | 'ipv6']> = [
  ['10.0.0.0', 8, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  ['100.64.0.0', 10, 'ipv4'],
  ['fc00::', 7, 'ipv6'],
];

const privateList = new net.BlockList();
for (const [prefix, bits, family] of PRIVATE_SUBNETS) privateList.addSubnet(prefix, bits, family);

/**
 * @param host - IP literal (IPv6 without brackets); a host name is never "private" here
 * @returns true when the address is in a range the opt-ins may allow
 */
export function isPrivateAddress(host: string): boolean {
  const family = net.isIP(host);
  return family !== 0 && privateList.check(host, family === 4 ? 'ipv4' : 'ipv6');
}

/**
 * @param host - hostname or IP literal (IPv6 without brackets)
 * @returns true when the host must not be used as an upstream
 */
export function isRestrictedHost(host: string): boolean {
  // "localhost." and "localhost" are the same name; so are FQDNs with a trailing dot
  const name = String(host).toLowerCase().replace(/\.+$/, '');

  if (BLOCKED_NAMES.has(name) || name.endsWith('.localhost')) {
    return true;
  }

  const family = net.isIP(name);
  if (family === 4) return blockList.check(name, 'ipv4');
  if (family === 6) return blockList.check(name, 'ipv6');
  return false;
}

/**
 * Upstream check with the UPSTREAM_ALLOW_PRIVATE opt-in. A reverse proxy often fronts services
 * on a LAN, so an admin can allow private ranges (10/8, 172.16/12, 192.168/16, ...). Loopback,
 * link-local and cloud-metadata addresses stay blocked. The variable is read on every call.
 *
 * @param host - hostname or IP literal (IPv6 without brackets)
 * @returns true when the host must not be used as an upstream
 */
export function isRestrictedUpstream(host: string): boolean {
  if (!isRestrictedHost(host)) return false;
  if (process.env.UPSTREAM_ALLOW_PRIVATE !== 'true') return true;
  return !isPrivateAddress(String(host).toLowerCase().replace(/\.+$/, ''));
}
