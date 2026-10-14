/**
 * Cluster mode (MODERNIZATION.md 0.25): every worker used to run migrations, the alert,
 * backup, metrics and certificate schedulers, Docker discovery and Git init, so each ran
 * N times. One leader worker owns that work; the others only serve requests.
 */
const EventEmitter = require('events');
const { isLeader, LEADER_ROLE } = require('../../src/utils/clusterRole');
const { superviseCluster } = require('../../src/clusterSupervisor');

describe('isLeader', () => {
  test('a single process is its own leader', () => {
    expect(isLeader({})).toBe(true);
    expect(isLeader({ CLUSTER_MODE: 'false' })).toBe(true);
  });

  test('in cluster mode only the worker started as leader is one', () => {
    expect(isLeader({ CLUSTER_MODE: 'true' })).toBe(false);
    expect(isLeader({ CLUSTER_MODE: 'true', CLUSTER_ROLE: 'follower' })).toBe(false);
    expect(isLeader({ CLUSTER_MODE: 'true', CLUSTER_ROLE: LEADER_ROLE })).toBe(true);
  });
});

describe('superviseCluster', () => {
  const makeCluster = () => {
    const cluster = new EventEmitter();
    cluster.forked = [];
    cluster.fork = jest.fn((env) => {
      const worker = new EventEmitter();
      worker.env = env;
      worker.process = { pid: 100 + cluster.forked.length };
      cluster.forked.push(worker);
      return worker;
    });
    return cluster;
  };
  const roles = (cluster) => cluster.forked.map((w) => w.env.CLUSTER_ROLE);
  const noWait = (fn) => fn();

  test('starts the leader alone and the followers once it is ready', () => {
    const cluster = makeCluster();
    superviseCluster(cluster, { workerCount: 3, schedule: noWait });

    expect(roles(cluster)).toEqual([LEADER_ROLE]);

    cluster.forked[0].emit('message', { type: 'ready' });
    expect(roles(cluster)).toEqual([LEADER_ROLE, 'follower', 'follower']);
  });

  test('ignores other messages and a second ready from the leader', () => {
    const cluster = makeCluster();
    superviseCluster(cluster, { workerCount: 2, schedule: noWait });

    cluster.forked[0].emit('message', { type: 'something-else' });
    expect(cluster.forked).toHaveLength(1);
    cluster.forked[0].emit('message', { type: 'ready' });
    cluster.forked[0].emit('message', { type: 'ready' });
    expect(cluster.forked).toHaveLength(2);
  });

  test('a dead follower is replaced by a follower', () => {
    const cluster = makeCluster();
    superviseCluster(cluster, { workerCount: 2, schedule: noWait });
    cluster.forked[0].emit('message', { type: 'ready' });

    cluster.emit('exit', cluster.forked[1], 1, null);

    expect(roles(cluster)).toEqual([LEADER_ROLE, 'follower', 'follower']);
  });

  test('a dead leader is replaced by a new leader, without restarting the followers', () => {
    const cluster = makeCluster();
    superviseCluster(cluster, { workerCount: 2, schedule: noWait });
    cluster.forked[0].emit('message', { type: 'ready' });

    cluster.emit('exit', cluster.forked[0], 1, null);

    expect(roles(cluster)).toEqual([LEADER_ROLE, 'follower', LEADER_ROLE]);
  });

  test('the new leader does not make the primary fork the followers again', () => {
    const cluster = makeCluster();
    superviseCluster(cluster, { workerCount: 2, schedule: noWait });
    cluster.forked[0].emit('message', { type: 'ready' });
    cluster.emit('exit', cluster.forked[0], 1, null);

    cluster.forked[2].emit('message', { type: 'ready' });

    expect(roles(cluster)).toEqual([LEADER_ROLE, 'follower', LEADER_ROLE]);
  });

  test('a leader that dies before it is ready is retried after a delay and the followers still wait', () => {
    const cluster = makeCluster();
    const schedule = jest.fn();
    superviseCluster(cluster, { workerCount: 2, schedule });

    cluster.emit('exit', cluster.forked[0], 1, null);
    expect(cluster.forked).toHaveLength(1);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), expect.any(Number));

    schedule.mock.calls[0][0]();
    expect(roles(cluster)).toEqual([LEADER_ROLE, LEADER_ROLE]);
    cluster.forked[1].emit('message', { type: 'ready' });
    expect(roles(cluster)).toEqual([LEADER_ROLE, LEADER_ROLE, 'follower']);
  });

  test('one worker means a leader and no followers', () => {
    const cluster = makeCluster();
    superviseCluster(cluster, { workerCount: 1, schedule: noWait });
    cluster.forked[0].emit('message', { type: 'ready' });
    expect(roles(cluster)).toEqual([LEADER_ROLE]);
  });
});
