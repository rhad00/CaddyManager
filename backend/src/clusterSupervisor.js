/**
 * Primary-process logic of cluster mode (MODERNIZATION.md 0.25).
 *
 * The leader worker starts first and runs the one-time and background work. The other
 * workers are forked only once the leader reports ready, so they never meet an
 * unmigrated database. A worker that dies is replaced by one with the same role; a
 * leader that dies is replaced by a new leader.
 */
const { LEADER_ROLE } = require('./utils/clusterRole');

const FOLLOWER_ROLE = 'follower';
const RESTART_DELAY_MS = 1000;

/**
 * @param {import('node:cluster').Cluster} cluster
 * @param {{ workerCount: number, schedule?: Function }} options
 * @returns {{ stop: () => void }}
 */
function superviseCluster(cluster, { workerCount, schedule = setTimeout }) {
  let leader = null;
  let followersStarted = false;
  let stopping = false;

  const forkFollower = () => cluster.fork({ CLUSTER_ROLE: FOLLOWER_ROLE });

  const forkLeader = () => {
    if (stopping) return;
    const worker = cluster.fork({ CLUSTER_ROLE: LEADER_ROLE });
    leader = worker;
    worker.on('message', (message) => {
      if (message?.type !== 'ready' || followersStarted) return;
      followersStarted = true;
      console.log(`Leader ${worker.process.pid} is ready: starting ${workerCount - 1} more workers`);
      for (let i = 1; i < workerCount; i++) forkFollower();
    });
  };

  cluster.on('exit', (worker, code, signal) => {
    if (stopping) return;
    const wasLeader = worker === leader;
    console.warn(`${wasLeader ? 'Leader' : 'Worker'} ${worker.process.pid} exited (${signal || code}). Restarting…`);
    if (wasLeader) leader = null;
    schedule(wasLeader ? forkLeader : forkFollower, RESTART_DELAY_MS);
  });

  forkLeader();

  return { stop: () => { stopping = true; } };
}

module.exports = { superviseCluster, FOLLOWER_ROLE };
