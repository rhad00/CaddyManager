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

  test('only a worker the primary started as a follower is not a leader', () => {
    expect(isLeader({ CLUSTER_MODE: 'true', CLUSTER_ROLE: 'follower' })).toBe(false);
    expect(isLeader({ CLUSTER_MODE: 'true', CLUSTER_ROLE: LEADER_ROLE })).toBe(true);
  });

  // CLUSTER_MODE=true can sit in a shared .env while the app is started with
  // `node src/index.js`: nobody would run the migrations or the schedulers
  test('a process started directly with CLUSTER_MODE=true is still a leader', () => {
    expect(isLeader({ CLUSTER_MODE: 'true' })).toBe(true);
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

  test('after stop() nothing is forked: not a pending follower, not a late ready', () => {
    const cluster = makeCluster();
    const schedule = jest.fn();
    const supervisor = superviseCluster(cluster, { workerCount: 3, schedule });
    cluster.forked[0].emit('message', { type: 'ready' });
    cluster.emit('exit', cluster.forked[1], 1, null); // a follower respawn is now pending
    const forkedBefore = cluster.forked.length;

    supervisor.stop();
    schedule.mock.calls[0][0]();

    expect(cluster.forked).toHaveLength(forkedBefore);
  });

  test('a ready that arrives after stop() starts no followers', () => {
    const cluster = makeCluster();
    const supervisor = superviseCluster(cluster, { workerCount: 3, schedule: noWait });

    supervisor.stop();
    cluster.forked[0].emit('message', { type: 'ready' });

    expect(cluster.forked).toHaveLength(1);
  });

  describe('a leader that keeps failing', () => {
    test('is retried with growing delays and then the primary gives up', () => {
      const cluster = makeCluster();
      const schedule = jest.fn();
      const onFatal = jest.fn();
      superviseCluster(cluster, { workerCount: 2, schedule, onFatal, maxLeaderFailures: 3 });

      for (let attempt = 0; attempt < 2; attempt++) {
        cluster.emit('exit', cluster.forked[attempt], 1, null);
        schedule.mock.calls[attempt][0]();
      }
      const delays = schedule.mock.calls.map((call) => call[1]);
      expect(delays[1]).toBeGreaterThan(delays[0]);
      expect(onFatal).not.toHaveBeenCalled();

      cluster.emit('exit', cluster.forked[2], 1, null);

      expect(onFatal).toHaveBeenCalledTimes(1);
      expect(schedule).toHaveBeenCalledTimes(2);
    });

    test('starts counting again once a leader got ready', () => {
      const cluster = makeCluster();
      const schedule = jest.fn();
      const onFatal = jest.fn();
      superviseCluster(cluster, { workerCount: 1, schedule, onFatal, maxLeaderFailures: 2 });

      cluster.emit('exit', cluster.forked[0], 1, null);
      schedule.mock.calls[0][0]();
      cluster.forked[1].emit('message', { type: 'ready' });
      cluster.emit('exit', cluster.forked[1], 1, null);

      expect(onFatal).not.toHaveBeenCalled();
    });
  });

  test('one worker means a leader and no followers', () => {
    const cluster = makeCluster();
    superviseCluster(cluster, { workerCount: 1, schedule: noWait });
    cluster.forked[0].emit('message', { type: 'ready' });
    expect(roles(cluster)).toEqual([LEADER_ROLE]);
  });
});
