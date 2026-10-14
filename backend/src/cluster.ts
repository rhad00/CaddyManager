/**
 * Cluster-aware entry point for CaddyManager backend.
 *
 * Usage:
 *   npm run start:cluster        (builds, then CLUSTER_MODE=true node dist/cluster.js)
 *   — or simply —
 *   node dist/cluster.js         (runs in single-process mode when CLUSTER_MODE is unset)
 *
 * Workers default to the number of CPU cores.
 * Override with CLUSTER_WORKERS=<n>.
 *
 * One worker (the leader) runs migrations, the schedulers, Docker discovery and Git
 * init; see clusterSupervisor.ts. Caddy configuration writes are serialized per process
 * only, so concurrent writes through different workers are not coordinated.
 */
import cluster from 'node:cluster';
import crypto from 'node:crypto';
import os from 'node:os';
import { superviseCluster } from './clusterSupervisor';

const clusterEnabled = process.env.CLUSTER_MODE === 'true';
const workerCount = parseInt(process.env.CLUSTER_WORKERS ?? '', 10) || os.cpus().length;

if (clusterEnabled && cluster.isPrimary) {
  // Without a configured key every worker would pick its own random one and could not
  // decrypt what another worker stored (production refuses to start without the key)
  if (!process.env.GIT_SECRET_KEY && process.env.NODE_ENV !== 'production') {
    process.env.GIT_SECRET_KEY = crypto.randomBytes(32).toString('hex');
  }

  console.log(`Primary ${process.pid}: starting ${workerCount} workers (leader first)`);
  const supervisor = superviseCluster(cluster, { workerCount });

  // Workers drain their requests within 15 s (app.ts); a worker that hangs longer
  // must not keep the primary, and with it the container, alive
  const SHUTDOWN_TIMEOUT_MS = 20000;
  const shutdown = (signal: NodeJS.Signals): void => {
    supervisor.stop();
    for (const worker of Object.values(cluster.workers ?? {})) worker?.kill(signal);
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
} else {
  // Single-process mode or worker process — run the normal app (loading it starts it)
  require('./index');
}
