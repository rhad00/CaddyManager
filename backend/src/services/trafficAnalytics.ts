/**
 * Per-proxy traffic analytics from the Caddy access log: requests over time by status class,
 * bandwidth, latency, visitors, clients, referrers, protocols, content, slow and failing paths, for
 * every proxy and in total, with the period before for comparison. The access log is the only place
 * Caddy records the host of a request, so it is read once, each line is matched to its proxy as it
 * is read, and only the proxy being looked at (and the total) gets the detailed breakdowns.
 */
import fs from 'fs';
import readline from 'readline';
import { parseLine, LOG_FILE, type LogEntry } from './logService';
import { normalizeHost } from './trafficStats';
import { HyperLogLog } from './hll';
import { classifyUserAgent, type UserAgentInfo } from './userAgent';
import { tlsVersionLabel, cipherLabel, protoLabel, contentCategory, pathOf, referrerHost } from './trafficLabels';

export const RANGES = {
  '1h': { seconds: 3600, bucketSeconds: 60 },
  '6h': { seconds: 6 * 3600, bucketSeconds: 300 },
  '24h': { seconds: 24 * 3600, bucketSeconds: 1800 },
  '7d': { seconds: 7 * 24 * 3600, bucketSeconds: 10800 },
} as const;
export type RangeKey = keyof typeof RANGES;

export const isRangeKey = (value: unknown): value is RangeKey =>
  typeof value === 'string' && Object.hasOwn(RANGES, value);

/** The id the API uses for hosts that belong to no proxy */
export const OTHER_ID = 'other';

/** Upper bounds in seconds; a request slower than the last bound falls in the overflow bin */
const LATENCY_BOUNDS_S = [0.001, 0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
/** Distinct keys remembered per breakdown: a scan cannot grow memory without bound */
const MAX_KEYS = 1000;
const TOP_N = 8;
/** A path needs this many requests before its latency is ranked */
const MIN_REQUESTS_FOR_SLOW = 5;

type EntryLike = Pick<LogEntry,
  'ts' | 'host' | 'status' | 'uri' | 'remote_ip' | 'duration' | 'size' | 'method' | 'user_agent' | 'proto' |
  'tls_version' | 'tls_cipher' | 'client_ip' | 'referer' | 'content_type' | 'bytes_read'>;

interface Series {
  requests: number[];
  ok: number[];
  redirect: number[];
  clientError: number[];
  serverError: number[];
  bytes: number[];
  bytesIn: number[];
  durationSum: number[];
  durationCount: number[];
}

interface PathStat { count: number; errors4: number; errors5: number; hist: number[] }

interface Heavy {
  visitors: HyperLogLog;
  visitorsSeries: Array<HyperLogLog | null>;
  hourly: number[];
  prevVisitors: HyperLogLog;
  browsers: Map<string, number>;
  systems: Map<string, number>;
  kinds: Map<string, number>;
  devices: Map<string, number>;
  referrers: Map<string, number>;
  protocols: Map<string, number>;
  tls: Map<string, number>;
  ciphers: Map<string, number>;
  methods: Map<string, number>;
  contentTypes: Map<string, number>;
  clients: Map<string, number>;
  paths: Map<string, PathStat>;
  blocked: [number, number, number]; // 401, 403, 429
}

interface Prev { requests: number; errors5xx: number; bytes: number; durationSum: number; durationCount: number }

interface Acc {
  requests: number;
  status: [number, number, number, number];
  bytes: number;
  bytesIn: number;
  durationSum: number;
  durationCount: number;
  hist: number[];
  series: Series;
  prev: Prev;
  heavy: Heavy | null;
}

export interface TopEntry { key: string; count: number }
export interface SlowPath { key: string; count: number; p95Ms: number }
export interface ErrorPath { key: string; count: number; errors5xx: number; errors4xx: number }

export interface TrafficSeries {
  requests: number[];
  ok: number[];
  redirect: number[];
  clientError: number[];
  serverError: number[];
  bytes: number[];
  bytesIn: number[];
  avgMs: Array<number | null>;
}

export interface TrafficDetail {
  /** Distinct client IPs: an estimate of visitors, not of people */
  visitors: number;
  visitorsSeries: number[];
  /** Requests per hour, from `hourlyFrom` (unix seconds, hour aligned), for a day-by-hour heatmap */
  hourly: number[];
  hourlyFrom: number;
  topPaths: TopEntry[];
  topClients: TopEntry[];
  browsers: TopEntry[];
  systems: TopEntry[];
  clientKinds: TopEntry[];
  devices: TopEntry[];
  referrers: TopEntry[];
  protocols: TopEntry[];
  tls: TopEntry[];
  ciphers: TopEntry[];
  methods: TopEntry[];
  contentTypes: TopEntry[];
  slowPaths: SlowPath[];
  errorPaths: ErrorPath[];
  /** Counted from status codes: which rule produced them is not in the log */
  blocked: { unauthorized: number; forbidden: number; rateLimited: number };
}

export interface PreviousPeriod {
  requests: number;
  errors5xx: number;
  bytes: number;
  avgMs: number | null;
  visitors?: number;
}

export interface TrafficSummary {
  requests: number;
  status: { '2xx': number; '3xx': number; '4xx': number; '5xx': number };
  bytes: number;
  bytesIn: number;
  avgMs: number | null;
  /** Approximate: the upper bound of the histogram bin that holds the percentile */
  p50Ms: number | null;
  p95Ms: number | null;
  series: TrafficSeries;
  /** The period just before this one, or null when the log does not reach back that far */
  previous: PreviousPeriod | null;
  /** Only for the total and the proxy that was asked for */
  detail?: TrafficDetail;
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
  previousCovered: boolean;
  /** The proxy id (or "other") that carries the detail, or null for all proxies */
  scope: string | null;
  totals: TrafficSummary;
  proxies: Array<TrafficSummary & { id: string; name: string; domains: string[]; proxyStatus?: string }>;
  /** Traffic for hosts that belong to no proxy (scanners, a removed proxy) */
  other: (TrafficSummary & { hosts: string[] }) | null;
}

const zeros = (n: number): number[] => new Array<number>(n).fill(0);

const newPrev = (): Prev => ({ requests: 0, errors5xx: 0, bytes: 0, durationSum: 0, durationCount: 0 });

function newHeavy(buckets: number, hours: number): Heavy {
  return {
    visitors: new HyperLogLog(),
    visitorsSeries: new Array<HyperLogLog | null>(buckets).fill(null),
    hourly: zeros(hours),
    prevVisitors: new HyperLogLog(),
    browsers: new Map(), systems: new Map(), kinds: new Map(), devices: new Map(), referrers: new Map(),
    protocols: new Map(), tls: new Map(), ciphers: new Map(), methods: new Map(), contentTypes: new Map(),
    clients: new Map(), paths: new Map(), blocked: [0, 0, 0],
  };
}

function newAcc(buckets: number, hours: number, heavy: boolean): Acc {
  return {
    requests: 0,
    status: [0, 0, 0, 0],
    bytes: 0,
    bytesIn: 0,
    durationSum: 0,
    durationCount: 0,
    hist: zeros(LATENCY_BOUNDS_S.length + 1),
    series: {
      requests: zeros(buckets), ok: zeros(buckets), redirect: zeros(buckets), clientError: zeros(buckets),
      serverError: zeros(buckets), bytes: zeros(buckets), bytesIn: zeros(buckets),
      durationSum: zeros(buckets), durationCount: zeros(buckets),
    },
    prev: newPrev(),
    heavy: heavy ? newHeavy(buckets, hours) : null,
  };
}

const bump = (map: Map<string, number>, key: string, by = 1): void => {
  const current = map.get(key);
  if (current !== undefined) map.set(key, current + by);
  else if (map.size < MAX_KEYS) map.set(key, by);
};

/** Class index 0..3 for 2xx..5xx, or -1 for a missing or odd status */
const classOf = (status: number | undefined): number =>
  typeof status === 'number' && status >= 200 && status < 600 ? Math.floor(status / 100) - 2 : -1;

const SERIES_BY_CLASS: Array<keyof Series> = ['ok', 'redirect', 'clientError', 'serverError'];

const latencyBin = (seconds: number): number => {
  const bin = LATENCY_BOUNDS_S.findIndex((bound) => seconds <= bound);
  return bin === -1 ? LATENCY_BOUNDS_S.length : bin;
};

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

const top = (map: Map<string, number>, n = TOP_N): TopEntry[] =>
  [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([key, count]) => ({ key, count }));

/** A client's user agent is classified once: logs repeat the same few strings */
const uaCache = new Map<string, UserAgentInfo>();
function classify(userAgent: string | undefined): UserAgentInfo {
  const key = userAgent ?? '';
  let info = uaCache.get(key);
  if (!info) {
    info = classifyUserAgent(userAgent);
    if (uaCache.size >= 2000) uaCache.clear();
    uaCache.set(key, info);
  }
  return info;
}

function addHeavy(heavy: Heavy, entry: EntryLike, bucket: number, hour: number): void {
  const client = entry.client_ip || entry.remote_ip;
  if (client) {
    heavy.visitors.add(client);
    (heavy.visitorsSeries[bucket] ??= new HyperLogLog()).add(client);
    bump(heavy.clients, client);
  }
  heavy.hourly[hour] += 1;

  const ua = classify(entry.user_agent);
  bump(heavy.kinds, ua.kind);
  bump(heavy.browsers, ua.name);
  bump(heavy.systems, ua.os);
  if (ua.device) bump(heavy.devices, ua.device);

  const ref = referrerHost(entry.referer, entry.host);
  if (ref) bump(heavy.referrers, ref);

  bump(heavy.protocols, protoLabel(entry.proto));
  bump(heavy.tls, tlsVersionLabel(entry.tls_version));
  if (entry.tls_cipher !== undefined) bump(heavy.ciphers, cipherLabel(entry.tls_cipher));
  bump(heavy.methods, entry.method || 'Unknown');
  bump(heavy.contentTypes, contentCategory(entry.content_type));

  const status = entry.status ?? 0;
  if (status === 401) heavy.blocked[0] += 1;
  else if (status === 403) heavy.blocked[1] += 1;
  else if (status === 429) heavy.blocked[2] += 1;

  const path = pathOf(entry.uri);
  let stat = heavy.paths.get(path);
  if (!stat && heavy.paths.size < MAX_KEYS) {
    stat = { count: 0, errors4: 0, errors5: 0, hist: zeros(LATENCY_BOUNDS_S.length + 1) };
    heavy.paths.set(path, stat);
  }
  if (stat) {
    stat.count += 1;
    if (status >= 500 && status < 600) stat.errors5 += 1;
    else if (status >= 400 && status < 500) stat.errors4 += 1;
    if (typeof entry.duration === 'number' && entry.duration >= 0) stat.hist[latencyBin(entry.duration)] += 1;
  }
}

function addCurrent(acc: Acc, entry: EntryLike, bucket: number, hour: number): void {
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
  if (typeof entry.bytes_read === 'number' && entry.bytes_read > 0) {
    acc.bytesIn += entry.bytes_read;
    acc.series.bytesIn[bucket] += entry.bytes_read;
  }
  if (typeof entry.duration === 'number' && entry.duration >= 0) {
    acc.durationSum += entry.duration;
    acc.durationCount += 1;
    acc.series.durationSum[bucket] += entry.duration;
    acc.series.durationCount[bucket] += 1;
    acc.hist[latencyBin(entry.duration)] += 1;
  }
  if (acc.heavy) addHeavy(acc.heavy, entry, bucket, hour);
}

function addPrevious(acc: Acc, entry: EntryLike): void {
  const p = acc.prev;
  p.requests += 1;
  if (typeof entry.status === 'number' && entry.status >= 500 && entry.status < 600) p.errors5xx += 1;
  if (typeof entry.size === 'number' && entry.size > 0) p.bytes += entry.size;
  if (typeof entry.duration === 'number' && entry.duration >= 0) {
    p.durationSum += entry.duration;
    p.durationCount += 1;
  }
  const client = entry.client_ip || entry.remote_ip;
  if (acc.heavy && client) acc.heavy.prevVisitors.add(client);
}

const domainsOf = (proxy: ProxyLike): string[] =>
  (Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains]).filter(Boolean).map(normalizeHost);

/** Which proxy serves a host: an exact domain first, then the longest wildcard that covers it */
export function proxyMatcher(proxies: ProxyLike[]): (host: string) => number {
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

function summarise(acc: Acc, previousCovered: boolean, hourlyFrom: number): TrafficSummary {
  const s = acc.series;
  const p = acc.prev;
  const summary: TrafficSummary = {
    requests: acc.requests,
    status: { '2xx': acc.status[0], '3xx': acc.status[1], '4xx': acc.status[2], '5xx': acc.status[3] },
    bytes: acc.bytes,
    bytesIn: acc.bytesIn,
    avgMs: acc.durationCount ? (acc.durationSum / acc.durationCount) * 1000 : null,
    p50Ms: percentileMs(acc.hist, 0.5),
    p95Ms: percentileMs(acc.hist, 0.95),
    series: {
      requests: s.requests, ok: s.ok, redirect: s.redirect, clientError: s.clientError, serverError: s.serverError,
      bytes: s.bytes, bytesIn: s.bytesIn,
      avgMs: s.durationCount.map((n, i) => (n ? (s.durationSum[i] / n) * 1000 : null)),
    },
    previous: previousCovered
      ? {
        requests: p.requests,
        errors5xx: p.errors5xx,
        bytes: p.bytes,
        avgMs: p.durationCount ? (p.durationSum / p.durationCount) * 1000 : null,
        ...(acc.heavy ? { visitors: acc.heavy.prevVisitors.count() } : {}),
      }
      : null,
  };

  const h = acc.heavy;
  if (h) {
    const slowPaths: SlowPath[] = [...h.paths.entries()]
      .filter(([, stat]) => stat.count >= MIN_REQUESTS_FOR_SLOW)
      .map(([key, stat]) => ({ key, count: stat.count, p95Ms: percentileMs(stat.hist, 0.95) }))
      .filter((p): p is SlowPath => p.p95Ms !== null)
      .sort((a, b) => b.p95Ms - a.p95Ms || b.count - a.count)
      .slice(0, TOP_N);
    const errorPaths: ErrorPath[] = [...h.paths.entries()]
      .filter(([, stat]) => stat.errors4 + stat.errors5 > 0)
      .map(([key, stat]) => ({ key, count: stat.count, errors5xx: stat.errors5, errors4xx: stat.errors4 }))
      .sort((a, b) => b.errors5xx - a.errors5xx || b.errors4xx - a.errors4xx || a.key.localeCompare(b.key))
      .slice(0, TOP_N);
    const pathTotals = new Map<string, number>([...h.paths.entries()].map(([key, stat]) => [key, stat.count]));

    summary.detail = {
      visitors: h.visitors.count(),
      visitorsSeries: h.visitorsSeries.map((hll) => (hll ? hll.count() : 0)),
      hourly: h.hourly,
      hourlyFrom,
      topPaths: top(pathTotals),
      topClients: top(h.clients),
      browsers: top(h.browsers, 10),
      systems: top(h.systems, 10),
      clientKinds: top(h.kinds, 4),
      devices: top(h.devices, 3),
      referrers: top(h.referrers),
      protocols: top(h.protocols, 4),
      tls: top(h.tls, 6),
      ciphers: top(h.ciphers, 6),
      methods: top(h.methods, 8),
      contentTypes: top(h.contentTypes, 10),
      slowPaths,
      errorPaths,
      blocked: { unauthorized: h.blocked[0], forbidden: h.blocked[1], rateLimited: h.blocked[2] },
    };
  }
  return summary;
}

export interface CollectorOptions {
  proxies: ProxyLike[];
  range: RangeKey;
  nowTs: number;
  /** Proxy id or "other" to carry the detailed breakdowns besides the total; null for the total only */
  scope?: string | null;
}

/** Reads entries one at a time, so a large log never has to sit in memory */
export function createTrafficCollector({ proxies, range, nowTs, scope = null }: CollectorOptions) {
  const { seconds, bucketSeconds } = RANGES[range];
  const startTs = Math.floor((nowTs - seconds) / bucketSeconds) * bucketSeconds;
  const span = nowTs - startTs;
  const previousStart = startTs - span;
  const buckets = Math.floor(span / bucketSeconds) + 1;
  const hourlyFrom = Math.floor(startTs / 3600) * 3600;
  const hours = Math.floor((nowTs - hourlyFrom) / 3600) + 1;

  const matchOf = proxyMatcher(proxies);
  const hostIndex = new Map<string, number>();
  const totals = newAcc(buckets, hours, true);
  const perProxy = proxies.map((proxy) => newAcc(buckets, hours, proxy.id === scope));
  const other = newAcc(buckets, hours, scope === OTHER_ID);
  const otherHosts = new Set<string>();
  let earliest = Infinity;

  return {
    startTs,
    previousStart,
    add(entry: EntryLike): void {
      if (typeof entry.ts !== 'number') return;
      earliest = Math.min(earliest, entry.ts);
      if (!entry.host || entry.ts < previousStart || entry.ts > nowTs + bucketSeconds) return;

      const host = normalizeHost(entry.host);
      let index = hostIndex.get(host);
      if (index === undefined) {
        index = matchOf(host);
        if (hostIndex.size < 5000) hostIndex.set(host, index);
      }
      const target = index >= 0 ? perProxy[index] : other;
      if (index < 0 && otherHosts.size < 200) otherHosts.add(host);

      if (entry.ts < startTs) {
        addPrevious(totals, entry);
        addPrevious(target, entry);
        return;
      }
      const bucket = Math.min(Math.floor((entry.ts - startTs) / bucketSeconds), buckets - 1);
      const hour = Math.min(Math.floor((entry.ts - hourlyFrom) / 3600), hours - 1);
      addCurrent(totals, entry, bucket, hour);
      addCurrent(target, entry, bucket, hour);
    },
    report(available: boolean): TrafficReport {
      const previousCovered = available && earliest <= previousStart;
      return {
        range,
        bucketSeconds,
        from: startTs,
        to: nowTs,
        available,
        coversWindow: available && earliest <= startTs,
        previousCovered,
        scope,
        totals: summarise(totals, previousCovered, hourlyFrom),
        proxies: proxies.map((proxy, i) => ({
          id: proxy.id,
          name: proxy.name,
          domains: domainsOf(proxy),
          proxyStatus: proxy.status,
          ...summarise(perProxy[i], previousCovered, hourlyFrom),
        })),
        other: other.requests > 0 || other.prev.requests > 0
          ? { ...summarise(other, previousCovered, hourlyFrom), hosts: [...otherHosts].sort() }
          : null,
      };
    },
  };
}

/** The report for a list of entries already in memory (tests, small inputs) */
export function analyseTraffic(entries: Iterable<EntryLike>, opts: CollectorOptions & { available?: boolean }): TrafficReport {
  const collector = createTrafficCollector(opts);
  for (const entry of entries) collector.add(entry);
  return collector.report(opts.available ?? true);
}

interface ReadOpts {
  proxies: ProxyLike[];
  range: RangeKey;
  scope?: string | null;
  nowTs?: number;
  file?: string;
}

/** Read the access log and build the report. A missing log is "unavailable", not "no traffic". */
export async function readTrafficReport({ proxies, range, scope = null, nowTs = Math.floor(Date.now() / 1000), file = LOG_FILE }: ReadOpts): Promise<TrafficReport> {
  const collector = createTrafficCollector({ proxies, range, nowTs, scope });
  if (!fs.existsSync(file)) return collector.report(false);

  const lines = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) {
    const entry = parseLine(line);
    if (entry) collector.add(entry);
  }
  return collector.report(true);
}
