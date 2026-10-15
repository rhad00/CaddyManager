/**
 * TCP reachability of a proxy's upstreams, for the upstream_down alert. A TCP connect is
 * what Caddy needs before it can proxy anything; HTTP-level health is Caddy's own active
 * health check.
 */
import net from 'net';
import { parseUpstream } from './upstream';

const DEFAULT_TIMEOUT_MS = 5000;

/** The parts of a Proxy row that name upstreams */
export interface ProxyUpstreams {
  upstream_url?: string | null;
  load_balancing?: { enabled?: boolean; upstreams?: Array<{ url?: string }> } | null;
  path_routing?: { enabled?: boolean; routes?: Array<{ upstream_url?: string }> } | null;
}

const dialOf = (url: string): string | null => {
  try {
    return parseUpstream(url).dial;
  } catch {
    return null; // validated on save; skip anything that no longer parses
  }
};

/**
 * Every distinct upstream address of a proxy: main, load-balanced and path-routed.
 * @returns dial addresses ("host:port")
 */
export function proxyDials(proxy: ProxyUpstreams): string[] {
  const urls: Array<string | null | undefined> = [proxy.upstream_url];
  if (proxy.load_balancing?.enabled) {
    urls.push(...(proxy.load_balancing.upstreams || []).map((u) => u.url));
  }
  if (proxy.path_routing?.enabled) {
    urls.push(...(proxy.path_routing.routes || []).map((r) => r.upstream_url));
  }
  const dials = urls
    .filter((url): url is string => Boolean(url))
    .map(dialOf)
    .filter((dial): dial is string => dial !== null);
  return [...new Set(dials)];
}

/** Split "host:port" / "[v6]:port" for net.connect. */
const splitDial = (dial: string): { host: string; port: number } => {
  const i = dial.lastIndexOf(':');
  return { host: dial.slice(0, i).replace(/^\[|\]$/g, ''), port: Number(dial.slice(i + 1)) };
};

/** @returns whether a TCP connection could be opened */
function canConnect(dial: string, timeoutMs: number): Promise<boolean> {
  const { host, port } = splitDial(dial);
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

/** @returns the upstream addresses that refused or timed out */
export async function unreachableUpstreams(
  proxy: ProxyUpstreams,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string[]> {
  const dials = proxyDials(proxy);
  const reachable = await Promise.all(dials.map((dial) => canConnect(dial, timeoutMs)));
  return dials.filter((_dial, i) => !reachable[i]);
}
