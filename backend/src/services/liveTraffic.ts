import fs from 'fs';
import { LOG_FILE, parseLine, type LogEntry } from './logService';

/** The live view looks at the last five minutes in five second steps */
export const LIVE_WINDOW_SECONDS = 300;
export const LIVE_STEP_SECONDS = 5;
/** Only the end of the log is read: a busy log must not be scanned for a five minute view */
export const LIVE_TAIL_BYTES = 512 * 1024;
const RECENT_LIMIT = 15;
const RATE_SECONDS = 10;

export interface LiveRequest {
  ts: number;
  host: string;
  method: string;
  /** Path only: the query string can hold tokens and is never returned */
  path: string;
  status: number;
  ms: number | null;
}

export interface LiveReport {
  from: number;
  to: number;
  stepSeconds: number;
  available: boolean;
  /** False when the tail read did not reach back to the start of the window (a very busy log) */
  coversWindow: boolean;
  total: number;
  /** Requests per second over the last few seconds */
  rate: number;
  series: { requests: number[]; serverErrors: number[] };
  recent: LiveRequest[];
}

const pathOnly = (uri: string | undefined): string => {
  const raw = uri ?? '/';
  const cut = raw.search(/[?#]/);
  return (cut === -1 ? raw : raw.slice(0, cut)).slice(0, 200) || '/';
};

/** Pure: entries (any order) into the live report as of `nowTs` */
export function analyseLive(
  entries: Iterable<LogEntry>,
  opts: { nowTs: number; available?: boolean; reachesBack?: boolean },
): LiveReport {
  const to = opts.nowTs;
  const from = to - LIVE_WINDOW_SECONDS;
  const steps = LIVE_WINDOW_SECONDS / LIVE_STEP_SECONDS;
  const requests = new Array<number>(steps).fill(0);
  const serverErrors = new Array<number>(steps).fill(0);
  const recent: LiveRequest[] = [];
  let total = 0;
  let lastRate = 0;

  for (const e of entries) {
    if (typeof e.status !== 'number' || e.ts < from || e.ts > to) continue;
    const i = Math.min(steps - 1, Math.floor((e.ts - from) / LIVE_STEP_SECONDS));
    requests[i] += 1;
    if (e.status >= 500) serverErrors[i] += 1;
    total += 1;
    if (e.ts > to - RATE_SECONDS) lastRate += 1;
    recent.push({
      ts: e.ts,
      host: e.host ?? '',
      method: e.method ?? '',
      path: pathOnly(e.uri),
      status: e.status,
      ms: typeof e.duration === 'number' ? Math.round(e.duration * 1000) : null,
    });
  }

  recent.sort((a, b) => b.ts - a.ts);
  return {
    from,
    to,
    stepSeconds: LIVE_STEP_SECONDS,
    available: opts.available ?? true,
    coversWindow: opts.reachesBack ?? true,
    total,
    rate: lastRate / RATE_SECONDS,
    series: { requests, serverErrors },
    recent: recent.slice(0, RECENT_LIMIT),
  };
}

/** The last `bytes` of a file as parsed entries; a cut first line is dropped. `reachesStart` when the whole file fit. */
export async function readTailEntries(
  file: string,
  bytes: number,
): Promise<{ entries: LogEntry[]; reachesStart: boolean } | null> {
  let handle: fs.promises.FileHandle;
  try {
    handle = await fs.promises.open(file, 'r');
  } catch {
    return null;
  }
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    let lines = buffer.toString('utf8').split('\n');
    if (start > 0) lines = lines.slice(1);
    const entries = lines.map(parseLine).filter((e): e is LogEntry => e !== null);
    return { entries, reachesStart: start === 0 };
  } finally {
    await handle.close();
  }
}

export async function readLiveReport({
  nowTs = Math.floor(Date.now() / 1000),
  file = LOG_FILE,
  tailBytes = LIVE_TAIL_BYTES,
}: { nowTs?: number; file?: string; tailBytes?: number } = {}): Promise<LiveReport> {
  const tail = await readTailEntries(file, tailBytes);
  if (!tail) return analyseLive([], { nowTs, available: false });
  const oldest = tail.entries.reduce((min, e) => Math.min(min, e.ts), Infinity);
  const reachesBack = tail.reachesStart || oldest <= nowTs - LIVE_WINDOW_SECONDS;
  return analyseLive(tail.entries, { nowTs, reachesBack });
}
