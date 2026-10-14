/**
 * Primary-process logic of cluster mode (MODERNIZATION.md 0.25).
 *
 * The leader worker starts first and runs the one-time and background work. The other
 * workers are forked only once the leader reports ready, so they never meet an
 * unmigrated database. A worker that dies is replaced by one with the same role; a
 * leader that dies is replaced by a new leader, with a growing delay while leaders keep
 * failing before they are ready, and the primary gives up after too many in a row (a
 * bad migration or a missing database would otherwise crash-loop forever).
 */
const { LEADER_ROLE, FOLLOWER_ROLE } = require('./utils/clusterRole');

const RESTART_DELAY_MS = 1000;
const MAX_RESTART_DELAY_MS = 30000;
const MAX_LEADER_FAILURES = 8;

/**
 * @param {import('node:cluster').Cluster} cluster
 * @param {{ workerCount: number, schedule?: Function, onFatal?: Function, maxLeaderFailures?: number }} options
 * @returns {{ stop: () => void }}
 */
function superviseCluster(cluster, {
  workerCount,
  schedule = setTimeout,
  onFatal = () => process.exit(1),
  maxLeaderFailures = MAX_LEADER_FAILURES,
}) {
  let leader = null;
  let leaderReady = false;
  let followersStarted = false;
  let failedLeaders = 0;
  let stopping = false;

  const forkFollower = () => {
    if (stopping) return;
    cluster.fork({ CLUSTER_ROLE: FOLLOWER_ROLE });
  };

  const forkLeader = () => {
    if (stopping) return;
    const worker = cluster.fork({ CLUSTER_ROLE: LEADER_ROLE });
    leader = worker;
    leaderReady = false;
    worker.on('message', (message) => {
      if (message?.type !== 'ready' || stopping || worker !== leader) return;
      leaderReady = true;
      failedLeaders = 0;
      if (followersStarted) return;
      followersStarted = true;
      console.log(`Leader ${worker.process.pid} is ready: starting ${workerCount - 1} more workers`);
      for (let i = 1; i < workerCount; i++) forkFollower();
    });
  };

  const onLeaderExit = () => {
    leader = null;
    if (!leaderReady) failedLeaders += 1;
    if (failedLeaders >= maxLeaderFailures) {
      console.error(`The leader failed ${failedLeaders} times in a row before it was ready; giving up`);
      onFatal();
      return;
    }
    const delay = Math.min(RESTART_DELAY_MS * 2 ** Math.max(failedLeaders - 1, 0), MAX_RESTART_DELAY_MS);
    schedule(forkLeader, delay);
  };

  cluster.on('exit', (worker, code, signal) => {
    if (stopping) return;
    const wasLeader = worker === leader;
    console.warn(`${wasLeader ? 'Leader' : 'Worker'} ${worker.process.pid} exited (${signal || code}). Restarting…`);
    if (wasLeader) onLeaderExit();
    else schedule(forkFollower, RESTART_DELAY_MS);
  });

  forkLeader();

  return { stop: () => { stopping = true; } };
}

module.exports = { superviseCluster };
