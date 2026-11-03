import fs from 'fs';
import readline from 'readline';
import { Op } from 'sequelize';
import { Proxy } from '../models/proxy';
import { TrafficRollup, TOTAL_SCOPE } from '../models/trafficRollup';
import { LOG_FILE, parseLine, type LogEntry } from './logService';
import { normalizeHost } from './trafficStats';
import { OTHER_ID, proxyMatcher } from './trafficAnalytics';

const HOUR = 3600;
const DAY = 86_400;
/** Hours older than this are not rolled up, whatever the log still holds */
const BACKFILL_DAYS = 35;
/** Rollups are kept this long */
export const KEEP_DAYS = 400;

export const HISTORY_RANGES = { '30d': 30, '90d': 90 } as const;
export type HistoryRange = keyof typeof HISTORY_RANGES;
export const isHistoryRange = (v: unknown): v is HistoryRange => typeof v === 'string' && Object.prototype.hasOwnProperty.call(HISTORY_RANGES, v);

type Counts = {
  requests: number; status_2xx: number; status_3xx: number; status_4xx: number; status_5xx: number;
  bytes: number; bytes_in: number; duration_sum_ms: number; duration_count: number;
};
export type RollupRow = Counts & { hour_ts: number; scope_id: string };

const zero = (): Counts => ({
  requests: 0, status_2xx: 0, status_3xx: 0, status_4xx: 0, status_5xx: 0,
  bytes: 0, bytes_in: 0, duration_sum_ms: 0, duration_count: 0,
});

function addEntry(c: Counts, e: Pick<LogEntry, 'status' | 'size' | 'bytes_read' | 'duration'>): void {
  c.requests += 1;
  const s = e.status ?? 0;
  if (s >= 500) c.status_5xx += 1;
  else if (s >= 400) c.status_4xx += 1;
  else if (s >= 300) c.status_3xx += 1;
  else if (s >= 200) c.status_2xx += 1;
  c.bytes += Number.isFinite(e.size) ? (e.size as number) : 0;
  c.bytes_in += Number.isFinite(e.bytes_read) ? (e.bytes_read as number) : 0;
  if (typeof e.duration === 'number' && Number.isFinite(e.duration)) {
    c.duration_sum_ms += e.duration * 1000;
    c.duration_count += 1;
  }
}

type ProxyRef = { id: string; domains: string[] | string };

/**
 * Pure: entries into one row per hour and scope for the hours in [fromHour, toHour).
 * Every entry counts for "total" and for the proxy it belongs to ("other" when none does).
 */
export function rollupEntries(
  entries: Iterable<LogEntry>,
  proxies: ProxyRef[],
  fromHour: number,
  toHour: number,
): RollupRow[] {
  const match = proxyMatcher(proxies as Parameters<typeof proxyMatcher>[0]);
  const cells = new Map<string, RollupRow>();
  const cell = (hour: number, scope: string): Counts => {
    const key = `${hour}|${scope}`;
    let row = cells.get(key);
    if (!row) {
      row = { hour_ts: hour, scope_id: scope, ...zero() };
      cells.set(key, row);
    }
    return row;
  };

  for (const e of entries) {
    if (typeof e.ts !== 'number' || typeof e.status !== 'number' || !e.host) continue;
    const hour = Math.floor(e.ts / HOUR) * HOUR;
    if (hour < fromHour || hour >= toHour) continue;
    const index = match(normalizeHost(e.host));
    addEntry(cell(hour, TOTAL_SCOPE), e);
    addEntry(cell(hour, index >= 0 ? proxies[index].id : OTHER_ID), e);
  }
  return [...cells.values()].sort((a, b) => a.hour_ts - b.hour_ts || a.scope_id.localeCompare(b.scope_id));
}

/**
 * Roll up every completed hour not yet stored, from the first hour the log covers in full.
 * The hour being lived through is never written, and neither is one the log only partly holds.
 */
export async function runRollup(
  { nowTs = Math.floor(Date.now() / 1000), file = LOG_FILE }: { nowTs?: number; file?: string } = {},
): Promise<{ hours: number; rows: number }> {
  if (!fs.existsSync(file)) return { hours: 0, rows: 0 };

  const currentHour = Math.floor(nowTs / HOUR) * HOUR;
  const last = (await TrafficRollup.max('hour_ts')) as number | null;
  const floor = currentHour - BACKFILL_DAYS * DAY;
  let fromHour = Math.max(floor, last === null || last === undefined ? floor : last + HOUR);
  if (fromHour >= currentHour) return { hours: 0, rows: 0 };

  const proxies = await Proxy.findAll({ attributes: ['id', 'domains'] });
  const refs: ProxyRef[] = proxies.map((p) => ({ id: p.id, domains: p.domains }));

  const entries: LogEntry[] = [];
  let earliest = Infinity;
  const lines = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) {
    const entry = parseLine(line);
    if (!entry) continue;
    earliest = Math.min(earliest, entry.ts);
    if (entry.ts >= fromHour && entry.ts < currentHour) entries.push(entry);
  }
  if (!Number.isFinite(earliest)) return { hours: 0, rows: 0 };

  // The hour the log begins in is only partly there unless it begins exactly on the hour
  const firstFull = Math.ceil(earliest / HOUR) * HOUR;
  fromHour = Math.max(fromHour, firstFull);
  if (fromHour >= currentHour) return { hours: 0, rows: 0 };

  const rows = rollupEntries(entries, refs, fromHour, currentHour);
  if (rows.length > 0) await TrafficRollup.bulkCreate(rows, { ignoreDuplicates: true });
  return { hours: (currentHour - fromHour) / HOUR, rows: rows.length };
}

export async function pruneRollups(nowTs: number = Math.floor(Date.now() / 1000)): Promise<number> {
  return TrafficRollup.destroy({ where: { hour_ts: { [Op.lt]: nowTs - KEEP_DAYS * DAY } } });
}

export interface HistoryReport {
  range: HistoryRange;
  /** Days are UTC days */
  bucketSeconds: number;
  from: number;
  scope: string | null;
  /** First hour with stored data; days before it are unknown, not empty */
  coveredFrom: number | null;
  series: { requests: number[]; clientError: number[]; serverError: number[]; bytes: number[]; avgMs: Array<number | null> };
  totals: { requests: number; serverErrors: number; bytes: number; avgMs: number | null };
}

/** Daily points for the last 30 or 90 days of one scope (all proxies when null) */
export async function readHistory(
  range: HistoryRange,
  scope: string | null,
  nowTs: number = Math.floor(Date.now() / 1000),
): Promise<HistoryReport> {
  const days = HISTORY_RANGES[range];
  const today = Math.floor(nowTs / DAY) * DAY;
  const from = today - (days - 1) * DAY;
  const scopeId = scope ?? TOTAL_SCOPE;

  const rows = await TrafficRollup.findAll({ where: { scope_id: scopeId, hour_ts: { [Op.gte]: from } }, raw: true });
  const first = (await TrafficRollup.min('hour_ts', { where: { scope_id: TOTAL_SCOPE } })) as number | null;

  const requests = new Array<number>(days).fill(0);
  const clientError = new Array<number>(days).fill(0);
  const serverError = new Array<number>(days).fill(0);
  const bytes = new Array<number>(days).fill(0);
  const durSum = new Array<number>(days).fill(0);
  const durCount = new Array<number>(days).fill(0);

  for (const r of rows) {
    const i = Math.min(days - 1, Math.floor((r.hour_ts - from) / DAY));
    requests[i] += r.requests;
    clientError[i] += r.status_4xx;
    serverError[i] += r.status_5xx;
    bytes[i] += Number(r.bytes);
    durSum[i] += r.duration_sum_ms;
    durCount[i] += r.duration_count;
  }
  const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);
  const totalCount = sum(durCount);

  return {
    range,
    bucketSeconds: DAY,
    from,
    scope,
    coveredFrom: first ?? null,
    series: {
      requests, clientError, serverError, bytes,
      avgMs: durSum.map((s, i) => (durCount[i] > 0 ? s / durCount[i] : null)),
    },
    totals: {
      requests: sum(requests),
      serverErrors: sum(serverError),
      bytes: sum(bytes),
      avgMs: totalCount > 0 ? sum(durSum) / totalCount : null,
    },
  };
}

let timer: NodeJS.Timeout | null = null;

/** Leader only: roll up hourly, and prune once a day's worth of runs have passed */
export function scheduleTrafficRollups(intervalMinutes = 60): void {
  const tick = (): void => {
    runRollup()
      .then(() => pruneRollups())
      .catch((error) => console.error('Traffic rollup failed:', error));
  };
  tick();
  if (timer) clearInterval(timer);
  timer = setInterval(tick, intervalMinutes * 60 * 1000);
  timer.unref();
  console.log(`Scheduled traffic rollups every ${intervalMinutes} minutes`);
}
