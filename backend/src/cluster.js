/**
 * Cluster-aware entry point for CaddyManager backend.
 *
 * Usage:
 *   CLUSTER_MODE=true node src/cluster.js
 *   — or simply —
 *   node src/cluster.js          (runs in single-process mode when CLUSTER_MODE is unset)
 *
 * Workers default to the number of CPU cores.
 * Override with CLUSTER_WORKERS=<n>.
 *
 * One worker (the leader) runs migrations, the schedulers, Docker discovery and Git
 * init; see clusterSupervisor.js. Caddy configuration writes are serialized per process
 * only, so concurrent writes through different workers are not coordinated.
 */
const cluster = require('node:cluster');
const os = require('node:os');
const { superviseCluster } = require('./clusterSupervisor');

const clusterEnabled = process.env.CLUSTER_MODE === 'true';
const workerCount = parseInt(process.env.CLUSTER_WORKERS, 10) || os.cpus().length;

if (clusterEnabled && cluster.isPrimary) {
  // Without a configured key every worker would pick its own random one and could not
  // decrypt what another worker stored (production refuses to start without the key)
  if (!process.env.GIT_SECRET_KEY && process.env.NODE_ENV !== 'production') {
    process.env.GIT_SECRET_KEY = require('node:crypto').randomBytes(32).toString('hex');
  }

  console.log(`Primary ${process.pid}: starting ${workerCount} workers (leader first)`);
  const supervisor = superviseCluster(cluster, { workerCount });

  const shutdown = (signal) => {
    supervisor.stop();
    for (const worker of Object.values(cluster.workers)) worker.kill(signal);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
} else {
  // Single-process mode or worker process — run the normal app
  require('./index');
}
