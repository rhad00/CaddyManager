/**
 * Which process owns the background work (migrations, schedulers, Docker discovery,
 * Git init). A single process always does; in cluster mode only the worker the primary
 * started as leader does, so that work does not run once per worker.
 */
const LEADER_ROLE = 'leader';

const isLeader = (env = process.env) =>
  env.CLUSTER_MODE !== 'true' || env.CLUSTER_ROLE === LEADER_ROLE;

module.exports = { LEADER_ROLE, isLeader };
