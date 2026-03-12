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
 */
const cluster = require('node:cluster');
const os = require('node:os');

const clusterEnabled = process.env.CLUSTER_MODE === 'true';
const workerCount = parseInt(process.env.CLUSTER_WORKERS, 10) || os.cpus().length;

if (clusterEnabled && cluster.isPrimary) {
  console.log(`Primary ${process.pid}: spawning ${workerCount} workers`);

  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`Worker ${worker.process.pid} exited (${signal || code}). Restarting…`);
    cluster.fork();
  });
} else {
  // Single-process mode or worker process — run the normal app
  require('./index');
}
