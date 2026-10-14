/**
 * Which process owns the background work (migrations, schedulers, Docker discovery,
 * Git init). A process does unless the cluster primary started it as a follower, so a
 * single process, or `node src/index.js` with CLUSTER_MODE=true left in a shared .env,
 * still runs the migrations and the schedulers.
 */
const LEADER_ROLE = 'leader';
const FOLLOWER_ROLE = 'follower';

const isLeader = (env = process.env) => env.CLUSTER_ROLE !== FOLLOWER_ROLE;

module.exports = { LEADER_ROLE, FOLLOWER_ROLE, isLeader };
