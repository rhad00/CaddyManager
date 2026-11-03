import axios from 'axios';
import { canConnect, proxyDials, type ProxyUpstreams } from '../utils/upstreamProbe';

const PROBE_TIMEOUT_MS = 2000;
const ADMIN_TIMEOUT_MS = 3000;

/** One upstream as Caddy's admin API reports it (GET /reverse_proxy/upstreams) */
export interface CaddyUpstream { address: string; num_requests: number; fails: number }

export type UpstreamState = 'up' | 'failing' | 'down' | 'unknown';

export interface UpstreamRow {
  proxyId: string;
  proxyName: string;
  /** host:port, as Caddy dials it */
  dial: string;
  /** TCP connect from CaddyManager; null when it was not tried */
  reachable: boolean | null;
  probeMs: number | null;
  /** Requests Caddy has in flight to it right now; null when Caddy did not list it */
  inFlight: number | null;
  /** Recent failures Caddy counted (non-zero only with passive health checks configured) */
  fails: number | null;
  state: UpstreamState;
}

export interface UpstreamHealthReport {
  checkedAt: string;
  /** False when Caddy's admin API could not be read; reachability is still reported */
  caddyAvailable: boolean;
  rows: UpstreamRow[];
}

type ProxyRef = ProxyUpstreams & { id: string; name: string };
type Probe = (dial: string, timeoutMs: number) => Promise<boolean>;

const ORDER: Record<UpstreamState, number> = { down: 0, failing: 1, unknown: 2, up: 3 };

export function stateOf(reachable: boolean | null, fails: number | null): UpstreamState {
  if (reachable === false) return 'down';
  if (reachable === true) return fails && fails > 0 ? 'failing' : 'up';
  return fails && fails > 0 ? 'failing' : 'unknown';
}

/** Pure but for the injected probe: every upstream of every proxy with its reachability and Caddy's counters */
export async function buildUpstreamHealth(
  proxies: ProxyRef[],
  caddy: CaddyUpstream[] | null,
  probe: Probe = canConnect,
  now: Date = new Date(),
): Promise<UpstreamHealthReport> {
  const byAddress = new Map((caddy ?? []).map((u) => [u.address, u]));
  const pairs = proxies.flatMap((p) => proxyDials(p).map((dial) => ({ proxy: p, dial })));
  // A shared upstream is probed once, not once per proxy
  const dials = [...new Set(pairs.map((x) => x.dial))];
  const probed = new Map<string, { ok: boolean; ms: number }>();
  await Promise.all(
    dials.map(async (dial) => {
      const started = Date.now();
      const ok = await probe(dial, PROBE_TIMEOUT_MS);
      probed.set(dial, { ok, ms: Date.now() - started });
    }),
  );

  const rows: UpstreamRow[] = pairs.map(({ proxy, dial }) => {
    const p = probed.get(dial);
    const c = byAddress.get(dial);
    const fails = c ? c.fails : null;
    return {
      proxyId: proxy.id,
      proxyName: proxy.name,
      dial,
      reachable: p ? p.ok : null,
      probeMs: p && p.ok ? p.ms : null,
      inFlight: c ? c.num_requests : null,
      fails,
      state: stateOf(p ? p.ok : null, fails),
    };
  });
  rows.sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.proxyName.localeCompare(b.proxyName) || a.dial.localeCompare(b.dial));
  return { checkedAt: now.toISOString(), caddyAvailable: caddy !== null, rows };
}

/** Caddy's own view of its upstreams, or null when the admin API cannot be read */
export async function fetchCaddyUpstreams(apiUrl: string = process.env.CADDY_API_URL || 'http://localhost:2019'): Promise<CaddyUpstream[] | null> {
  try {
    const { data } = await axios.get<unknown>(`${apiUrl}/reverse_proxy/upstreams`, { timeout: ADMIN_TIMEOUT_MS });
    if (!Array.isArray(data)) return null;
    return data
      .filter((u): u is Record<string, unknown> => typeof u === 'object' && u !== null && typeof (u as { address?: unknown }).address === 'string')
      .map((u) => ({ address: String(u.address), num_requests: Number(u.num_requests) || 0, fails: Number(u.fails) || 0 }));
  } catch {
    return null;
  }
}
