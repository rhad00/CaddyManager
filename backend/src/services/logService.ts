import fs from 'fs';
import path from 'path';
import readline from 'readline';
import type { Request, Response } from 'express';

export const LOG_FILE = process.env.CADDY_ACCESS_LOG || path.join(__dirname, '../../logs/access.log');

/** One parsed line of Caddy's structured JSON access log */
export interface LogEntry {
  ts: number;
  timestamp: string;
  level: string;
  logger: string;
  status?: number;
  method?: string;
  host?: string;
  uri?: string;
  remote_ip?: string;
  user_agent?: string;
  duration?: number;
  size?: number;
  /** Raw entry for anything else */
  raw: Record<string, unknown>;
}

/** Filter options of the log viewer; the values come straight from the query string */
export interface LogFilters {
  status?: string | number;
  method?: string;
  host?: string;
  ip?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: string | number;
}

/**
 * Parse a single line of a Caddy structured JSON access log.
 * Returns null if the line is not a valid JSON access log entry.
 */
export function parseLine(line: string): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const entry = JSON.parse(trimmed);
    // Caddy structured log entries have a ts (unix timestamp) and a logger field
    if (!entry.ts) return null;
    return {
      ts: entry.ts,
      timestamp: new Date(entry.ts * 1000).toISOString(),
      level: entry.level || 'info',
      logger: entry.logger || '',
      // HTTP-specific fields
      status: entry.status,
      method: entry.request?.method,
      host: entry.request?.host,
      uri: entry.request?.uri,
      remote_ip: entry.request?.remote_ip,
      user_agent: entry.request?.headers?.['User-Agent']?.[0],
      duration: entry.duration,
      size: entry.size,
      // Raw entry for anything else
      raw: entry,
    };
  } catch {
    return null;
  }
}

/**
 * Read the last `lines` lines from a file efficiently.
 * Uses a reverse-read approach to avoid loading the entire file.
 */
async function readLastLines(filePath: string, maxLines: number): Promise<LogEntry[]> {
  return new Promise((resolve) => {
    const results: LogEntry[] = [];
    if (!fs.existsSync(filePath)) {
      return resolve([]);
    }

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      const entry = parseLine(line);
      if (entry) {
        results.push(entry);
        // Keep only the last maxLines in memory
        if (results.length > maxLines) results.shift();
      }
    });

    rl.on('close', () => resolve(results));
    rl.on('error', () => resolve(results));
  });
}

/**
 * Filter log entries based on query parameters.
 */
function filterEntries(entries: LogEntry[], { status, method, host, ip, search, from, to }: LogFilters): LogEntry[] {
  return entries.filter((e) => {
    if (status && String(e.status) !== String(status)) return false;
    if (method && e.method && e.method.toUpperCase() !== method.toUpperCase()) return false;
    if (host && e.host && !e.host.includes(host)) return false;
    if (ip && e.remote_ip && !e.remote_ip.includes(ip)) return false;
    if (search) {
      const hay = `${e.uri || ''} ${e.host || ''} ${e.remote_ip || ''}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    if (from) {
      const fromTs = new Date(from).getTime() / 1000;
      if (e.ts < fromTs) return false;
    }
    if (to) {
      const toTs = new Date(to).getTime() / 1000;
      if (e.ts > toTs) return false;
    }
    return true;
  });
}

/**
 * Get log entries with optional filters.
 * @param opts - Filter options
 */
export async function getLogs(opts: LogFilters = {}): Promise<LogEntry[]> {
  const limit = Math.min(parseInt(String(opts.limit)) || 500, 2000);
  const entries = await readLastLines(LOG_FILE, limit * 4); // over-fetch then filter
  const filtered = filterEntries(entries, opts);
  return filtered.slice(-limit).reverse(); // newest first
}

/**
 * Stream new log lines to an HTTP response via Server-Sent Events.
 * Watches the log file for changes and forwards new lines.
 * @param req - Express request
 * @param res - Express response
 */
export function streamLogs(req: Request, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable NGINX buffering
  res.flushHeaders();

  let fileSize = 0;
  try {
    if (fs.existsSync(LOG_FILE)) {
      fileSize = fs.statSync(LOG_FILE).size;
    }
  } catch { /* ignore */ }

  const sendKeepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  let watcher: fs.FSWatcher | null = null;

  const watchFile = (): void => {
    if (!fs.existsSync(LOG_FILE)) {
      // Retry in 2s if file doesn't exist yet
      setTimeout(watchFile, 2000);
      return;
    }

    watcher = fs.watch(LOG_FILE, { persistent: false }, (event) => {
      if (event !== 'change') return;
      try {
        const stat = fs.statSync(LOG_FILE);
        if (stat.size <= fileSize) return; // truncated or no change

        const stream = fs.createReadStream(LOG_FILE, { start: fileSize, encoding: 'utf8' });
        fileSize = stat.size;

        let buffer = '';
        stream.on('data', (chunk) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? ''; // keep incomplete last line
          for (const line of lines) {
            const entry = parseLine(line);
            if (entry) {
              res.write(`data: ${JSON.stringify(entry)}\n\n`);
            }
          }
        });
        stream.on('error', () => { /* ignore */ });
      } catch { /* ignore */ }
    });
  };

  watchFile();

  req.on('close', () => {
    clearInterval(sendKeepAlive);
    if (watcher) watcher.close();
  });
}

/**
 * Get log file stats (size, line count estimate, path).
 */
export function getLogStats(): { exists: boolean; path: string; size: number; mtime?: Date } {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return { exists: false, path: LOG_FILE, size: 0 };
    }
    const stat = fs.statSync(LOG_FILE);
    return { exists: true, path: LOG_FILE, size: stat.size, mtime: stat.mtime };
  } catch {
    return { exists: false, path: LOG_FILE, size: 0 };
  }
}
