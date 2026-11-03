/**
 * Per-proxy traffic analytics from the Caddy access log: requests over time by status class,
 * bandwidth, latency, top paths and clients. The access log is the only place Caddy records
 * the host of a request, so it is read once per call and aggregated per host, then per proxy.
 */
import fs from 'fs';
import readline from 'readline';
import { parseLine, LOG_FILE, type LogEntry } from './logService';
import { normalizeHost } from './trafficStats';

export const RANGES = {
  '1h': { seconds: 3600, bucketSeconds: 60 },
  '6h': { seconds: 6 * 3600, bucketSeconds: 300 },
  '24h': { seconds: 24 * 3600, bucketSeconds: 1800 },
  '7d': { seconds: 7 * 24 * 3600, bucketSeconds: 10800 },
} as const;
export type RangeKey = keyof typeof RANGES;

export const isRangeKey = (value: unknown): value is RangeKey =>
  typeof value === 'string' && Object.hasOwn(RANGES, value);

/** Upper bounds in seconds; a request slower than the last bound falls in the overflow bin */
const LATENCY_BOUNDS_S = [0.001, 0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
/** Distinct paths or clients remembered per host: a scan cannot grow memory without bound */
const MAX_KEYS = 1000;
const TOP_N = 8;

type EntryLike = Pick<LogEntry, 'ts' | 'host' | 'status' | 'uri' | 'remote_ip' | 'duration' | 'size'>;

interface Series {
  requests: number[];
  ok: number[];
  redirect: number[];
  clientError: number[];
  serverError: number[];
  bytes: number[];
  durationSum: number[];
  durationCount: number[];
}

interface Acc {
  requests: number;
  status: [number, number, number, number];
  bytes: number;
  durationSum: number;
  durationCount: number;
  hist: number[];
  series: Series;
  paths: Map<string, number>;
  clients: Map<string, number>;
}

export interface TopEntry { key: string; count: number }

export interface TrafficSeries {
  requests: number[];
  ok: number[];
  redirect: number[];
  clientError: number[];
  serverError: number[];
  bytes: number[];
  avgMs: Array<number | null>;
}

export interface TrafficSummary {
  requests: number;
  status: { '2xx': number; '3xx': number; '4xx': number; '5xx': number };
  bytes: number;
  avgMs: number | null;
  /** Approximate: the upper bound of the histogram bin that holds the percentile */
  p50Ms: number | null;
  p95Ms: number | null;
  topPaths: TopEntry[];
  topClients: TopEntry[];
  series: TrafficSeries;
}

export interface ProxyLike { id: string; name: string; domains: string[] | string; status?: string }

export interface TrafficReport {
  range: RangeKey;
  bucketSeconds: number;
  from: number;
  to: number;
  available: boolean;
  /** false when the log starts after the window, so the early part of the charts is empty by lack of data */
  coversWindow: boolean;
  totals: TrafficSummary;
  proxies: Array<TrafficSummary & { id: string; name: string; domains: string[]; proxyStatus?: string }>;
  /** Traffic for hosts that belong to no proxy (scanners, a removed proxy) */
  other: (TrafficSummary & { hosts: string[] }) | null;
}

interface WindowOpts { nowTs: number; range: RangeKey }

const windowOf = ({ nowTs, range }: WindowOpts) => {
  const { seconds, bucketSeconds } = RANGES[range];
  const startTs = Math.floor((nowTs - seconds) / bucketSeconds) * bucketSeconds;
  const buckets = Math.floor((nowTs - startTs) / bucketSeconds) + 1;
  return { startTs, buckets, bucketSeconds };
};

const zeros = (n: number): number[] => new Array<number>(n).fill(0);

function newAcc(buckets: number): Acc {
  return {
    requests: 0,
    status: [0, 0, 0, 0],
    bytes: 0,
    durationSum: 0,
    durationCount: 0,
    hist: zeros(LATENCY_BOUNDS_S.length + 1),
    series: {
      requests: zeros(buckets), ok: zeros(buckets), redirect: zeros(buckets), clientError: zeros(buckets),
      serverError: zeros(buckets), bytes: zeros(buckets), durationSum: zeros(buckets), durationCount: zeros(buckets),
    },
    paths: new Map(),
    clients: new Map(),
  };
}

const bump = (map: Map<string, number>, key: string, by = 1): void => {
  const current = map.get(key);
  if (current !== undefined) map.set(key, current + by);
  else if (map.size < MAX_KEYS) map.set(key, by);
};

const pathOf = (uri: string | undefined): string => {
  if (!uri) return '/';
  const q = uri.indexOf('?');
  return (q === -1 ? uri : uri.slice(0, q)) || '/';
};

/** Class index 0..3 for 2xx..5xx, or -1 for a missing or odd status */
const classOf = (status: number | undefined): number =>
  typeof status === 'number' && status >= 200 && status < 600 ? Math.floor(status / 100) - 2 : -1;

const SERIES_BY_CLASS: Array<keyof Series> = ['ok', 'redirect', 'clientError', 'serverError'];

function addEntry(acc: Acc, entry: EntryLike, bucket: number): void {
  acc.requests += 1;
  acc.series.requests[bucket] += 1;

  const cls = classOf(entry.status);
  if (cls >= 0) {
    acc.status[cls] += 1;
    acc.series[SERIES_BY_CLASS[cls]][bucket] += 1;
  }

  if (typeof entry.size === 'number' && entry.size > 0) {
    acc.bytes += entry.size;
    acc.series.bytes[bucket] += entry.size;
  }

  if (typeof entry.duration === 'number' && entry.duration >= 0) {
    acc.durationSum += entry.duration;
    acc.durationCount += 1;
    acc.series.durationSum[bucket] += entry.duration;
    acc.series.durationCount[bucket] += 1;
    let bin = LATENCY_BOUNDS_S.findIndex((bound) => entry.duration! <= bound);
    if (bin === -1) bin = LATENCY_BOUNDS_S.length;
    acc.hist[bin] += 1;
  }

  bump(acc.paths, pathOf(entry.uri));
  if (entry.remote_ip) bump(acc.clients, entry.remote_ip);
}

/** Collects entries one at a time, so a large log never has to sit in memory */
export function trafficCollector(opts: WindowOpts): { add(entry: EntryLike): void; hosts: Map<string, Acc> } {
  const { startTs, buckets, bucketSeconds } = windowOf(opts);
  const hosts = new Map<string, Acc>();
  return {
    hosts,
    add(entry) {
      if (!entry.host || typeof entry.ts !== 'number') return;
      if (entry.ts < startTs || entry.ts > opts.nowTs + bucketSeconds) return;
      const bucket = Math.min(Math.floor((entry.ts - startTs) / bucketSeconds), buckets - 1);
      const host = normalizeHost(entry.host);
      let acc = hosts.get(host);
      if (!acc) {
        acc = newAcc(buckets);
        hosts.set(host, acc);
      }
      addEntry(acc, entry, bucket);
    },
  };
}

/** Bucket the entries of the window per host (lower-case, without port) */
export function aggregateTraffic(entries: Iterable<EntryLike>, opts: WindowOpts): Map<string, Acc> {
  const collector = trafficCollector(opts);
  for (const entry of entries) collector.add(entry);
  return collector.hosts;
}

function mergeInto(target: Acc, source: Acc): void {
  target.requests += source.requests;
  source.status.forEach((n, i) => { target.status[i] += n; });
  target.bytes += source.bytes;
  target.durationSum += source.durationSum;
  target.durationCount += source.durationCount;
  source.hist.forEach((n, i) => { target.hist[i] += n; });
  for (const key of Object.keys(source.series) as Array<keyof Series>) {
    source.series[key].forEach((n, i) => { target.series[key][i] += n; });
  }
  source.paths.forEach((n, k) => bump(target.paths, k, n));
  source.clients.forEach((n, k) => bump(target.clients, k, n));
}

function percentileMs(hist: number[], q: number): number | null {
  const total = hist.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const need = Math.ceil(total * q);
  let seen = 0;
  for (let i = 0; i < hist.length; i++) {
    seen += hist[i];
    if (seen >= need) {
      const bound = i < LATENCY_BOUNDS_S.length ? LATENCY_BOUNDS_S[i] : LATENCY_BOUNDS_S[LATENCY_BOUNDS_S.length - 1];
      return bound * 1000;
    }
  }
  return null;
}

const top = (map: Map<string, number>): TopEntry[] =>
  [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TOP_N).map(([key, count]) => ({ key, count }));

function summarise(acc: Acc): TrafficSummary {
  const s = acc.series;
  return {
    requests: acc.requests,
    status: { '2xx': acc.status[0], '3xx': acc.status[1], '4xx': acc.status[2], '5xx': acc.status[3] },
    bytes: acc.bytes,
    avgMs: acc.durationCount ? (acc.durationSum / acc.durationCount) * 1000 : null,
    p50Ms: percentileMs(acc.hist, 0.5),
    p95Ms: percentileMs(acc.hist, 0.95),
    topPaths: top(acc.paths),
    topClients: top(acc.clients),
    series: {
      requests: s.requests, ok: s.ok, redirect: s.redirect, clientError: s.clientError, serverError: s.serverError,
      bytes: s.bytes,
      avgMs: s.durationCount.map((n, i) => (n ? (s.durationSum[i] / n) * 1000 : null)),
    },
  };
}

const domainsOf = (proxy: ProxyLike): string[] =>
  (Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains]).filter(Boolean).map(normalizeHost);

/** Which proxy serves a host: an exact domain first, then the longest wildcard that covers it */
function proxyMatcher(proxies: ProxyLike[]): (host: string) => number {
  const exact = new Map<string, number>();
  const wildcards: Array<{ suffix: string; index: number }> = [];
  proxies.forEach((proxy, index) => {
    for (const domain of domainsOf(proxy)) {
      if (domain.startsWith('*.')) wildcards.push({ suffix: domain.slice(1), index });
      else if (!exact.has(domain)) exact.set(domain, index);
    }
  });
  wildcards.sort((a, b) => b.suffix.length - a.suffix.length);
  return (host) => {
    const direct = exact.get(host);
    if (direct !== undefined) return direct;
    const wild = wildcards.find((w) => host.endsWith(w.suffix) && host.length > w.suffix.length);
    return wild ? wild.index : -1;
  };
}

interface BuildOpts extends WindowOpts {
  hosts: Map<string, Acc>;
  proxies: ProxyLike[];
  available: boolean;
  coversWindow: boolean;
}

export function buildTrafficReport({ hosts, proxies, nowTs, range, available, coversWindow }: BuildOpts): TrafficReport {
  const { startTs, buckets, bucketSeconds } = windowOf({ nowTs, range });
  const matchOf = proxyMatcher(proxies);
  const perProxy = proxies.map(() => newAcc(buckets));
  const other = newAcc(buckets);
  const otherHosts: string[] = [];
  const totals = newAcc(buckets);

  for (const [host, acc] of hosts) {
    const index = matchOf(host);
    if (index >= 0) mergeInto(perProxy[index], acc);
    else {
      mergeInto(other, acc);
      otherHosts.push(host);
    }
    mergeInto(totals, acc);
  }

  return {
    range,
    bucketSeconds,
    from: startTs,
    to: nowTs,
    available,
    coversWindow,
    totals: summarise(totals),
    proxies: proxies.map((proxy, i) => ({
      id: proxy.id,
      name: proxy.name,
      domains: domainsOf(proxy),
      proxyStatus: proxy.status,
      ...summarise(perProxy[i]),
    })),
    other: other.requests > 0 ? { ...summarise(other), hosts: otherHosts.sort() } : null,
  };
}

interface ReadOpts {
  proxies: ProxyLike[];
  range: RangeKey;
  nowTs?: number;
  file?: string;
}

/** Read the access log and build the report. A missing log is "unavailable", not "no traffic". */
export async function readTrafficReport({ proxies, range, nowTs = Math.floor(Date.now() / 1000), file = LOG_FILE }: ReadOpts): Promise<TrafficReport> {
  const opts = { nowTs, range };
  if (!fs.existsSync(file)) {
    return buildTrafficReport({ hosts: new Map(), proxies, ...opts, available: false, coversWindow: false });
  }

  const { startTs } = windowOf(opts);
  let earliest = Infinity;
  const collector = trafficCollector(opts);
  const lines = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) {
    const entry = parseLine(line);
    if (!entry) continue;
    earliest = Math.min(earliest, entry.ts);
    collector.add(entry);
  }

  return buildTrafficReport({
    hosts: collector.hosts,
    proxies,
    ...opts,
    available: true,
    coversWindow: earliest <= startTs,
  });
}
