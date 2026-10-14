/**
 * Which process owns the background work (migrations, schedulers, Docker discovery,
 * Git init). A process does unless the cluster primary started it as a follower, so a
 * single process, or `node src/index.js` with CLUSTER_MODE=true left in a shared .env,
 * still runs the migrations and the schedulers.
 */
export const LEADER_ROLE = 'leader';
export const FOLLOWER_ROLE = 'follower';

export const isLeader = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.CLUSTER_ROLE !== FOLLOWER_ROLE;
