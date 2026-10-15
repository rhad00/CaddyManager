import crypto from 'crypto';
import { Op, UniqueConstraintError } from 'sequelize';

export interface DbLockOptions {
  /** Pause between attempts */
  retryMs?: number;
  /** How long to wait for the lock before giving up */
  timeoutMs?: number;
  /** How long a holder may keep it; a crashed holder stops blocking after this */
  ttlMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Take a named lock shared by every process that uses the database. The row's primary key makes
 * the insert the atomic step: whoever inserts it holds the lock. A row past its expiry belongs to
 * a holder that died and is removed by the next contender.
 * @returns release function (safe to call twice; it only removes a row this holder owns)
 */
export async function acquireDbLock(name: string, options: DbLockOptions = {}): Promise<() => Promise<void>> {
  const { retryMs = 50, timeoutMs = 30000, ttlMs = 60000 } = options;
  // Loaded here, not at the top: only cluster mode ever takes this lock
  const { ConfigLock } = require('../models/configLock') as typeof import('../models/configLock');
  const owner = crypto.randomUUID();
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      await ConfigLock.create({ name, owner, expires_at: new Date(Date.now() + ttlMs) });
      return async () => {
        await ConfigLock.destroy({ where: { name, owner } });
      };
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
    }

    // Held: clear it if its holder is gone, otherwise wait
    const cleared = await ConfigLock.destroy({ where: { name, expires_at: { [Op.lt]: new Date() } } });
    if (cleared > 0) continue;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for lock "${name}"`);
    await sleep(retryMs);
  }
}
