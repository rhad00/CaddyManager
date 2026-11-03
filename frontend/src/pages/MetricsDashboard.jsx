import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { get, apiError, describeError } from '../utils/api';
import HistoryChart from '../components/metrics/HistoryChart';
import StatusBreakdown from '../components/metrics/StatusBreakdown';
import {
  DASH,
  formatBytes,
  formatCount,
  formatDuration,
  formatPercent,
  statusBreakdown,
  verdict,
  historySeries,
  timeLabels,
  ageText,
  clockTime,
} from '../utils/metricsModel';

const INTERVALS = [
  { value: 10, label: '10 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
];
const INTERVAL_KEY = 'caddymanager.metrics.refresh';

const readInterval = () => {
  try {
    const stored = Number(localStorage.getItem(INTERVAL_KEY));
    return INTERVALS.some((i) => i.value === stored) ? stored : 30;
  } catch {
    return 30;
  }
};

const TONE = {
  ok: 'bg-green-100 text-green-900',
  warn: 'bg-amber-100 text-amber-900',
  bad: 'bg-red-100 text-red-900',
  unknown: 'bg-gray-100 text-gray-800',
};

const perMinute = (v) => `${v.toFixed(v < 10 ? 1 : 0)} per min`;
const mebibytes = (v) => `${v.toFixed(1)} MiB`;
const plainTick = (v) => String(Number(v.toFixed(1)));

const Stat = ({ label, value }) => (
  <div className="min-w-0">
    <dt className="text-sm text-gray-700">{label}</dt>
    <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-gray-900">{value}</dd>
  </div>
);

const Detail = ({ label, value, note }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-gray-200 py-3 last:border-0">
    <dt className="text-sm text-gray-700">
      {label}
      {note && <span className="block text-gray-600">{note}</span>}
    </dt>
    <dd className="shrink-0 font-mono text-sm tabular-nums text-gray-900">{value}</dd>
  </div>
);

const MetricsDashboard = () => {
  const { token } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);
  const [interval, setIntervalSeconds] = useState(readInterval);
  const [now, setNow] = useState(Date.now());
  const inFlight = useRef(false);

  // One refresh loads the current figures and the history, so the page never shows two ages
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const response = await get('/metrics', token);
      if (!response.ok) throw await apiError(response, 'load metrics');
      const data = await response.json();
      setMetrics(data.metrics ?? null);
      setLoadedAt(Date.now());
      setError(null);
    } catch (err) {
      console.error('Error fetching metrics:', err);
      setError(describeError(err, 'load the metrics'));
    }
    try {
      const response = await get('/metrics/historical?limit=24', token);
      if (!response.ok) throw await apiError(response, 'load the history');
      const data = await response.json();
      setHistory(Array.isArray(data.metrics) ? data.metrics : []);
      setHistoryError(null);
    } catch (err) {
      console.error('Error fetching historical metrics:', err);
      setHistoryError(describeError(err, 'load the history'));
    }
    inFlight.current = false;
    setRefreshing(false);
    setLoadedOnce(true);
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(refresh, interval * 1000);
    return () => clearInterval(id);
  }, [refresh, interval]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const chooseInterval = (seconds) => {
    setIntervalSeconds(seconds);
    try {
      localStorage.setItem(INTERVAL_KEY, String(seconds));
    } catch {
      // the choice then only lasts for this visit
    }
  };

  const points = useMemo(() => historySeries(history), [history]);
  const labels = useMemo(() => timeLabels(points), [points]);
  const rates = useMemo(() => points.map((p) => p.perMinute), [points]);
  const memory = useMemo(() => points.map((p) => p.memoryMiB), [points]);

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Caddy metrics</h1>
        <p role="status" className="mt-1 text-sm text-gray-700">
          {refreshing
            ? 'Updating…'
            : loadedAt
              ? `Updated ${clockTime(loadedAt)}, ${ageText(loadedAt, now)}`
              : loadedOnce ? 'Not updated yet' : 'Loading…'}
        </p>
      </div>
      <div className="flex items-end gap-3">
        <div>
          <label htmlFor="refresh-interval" className="block text-sm font-medium text-gray-800">Auto-refresh every</label>
          <select
            id="refresh-interval"
            value={interval}
            onChange={(e) => chooseInterval(Number(e.target.value))}
            className="mt-1 block min-h-11 rounded-md border border-edge bg-white px-3 text-sm text-gray-900"
          >
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="min-h-11 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          Refresh now
        </button>
      </div>
    </div>
  );

  if (!loadedOnce) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {header}
        <p className="mt-10 text-sm text-gray-700">Loading metrics…</p>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {header}
        <div role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p>{error}</p>
          <p className="mt-1">
            Check that Caddy is running and its admin API is reachable, then try again. This page retries on its own every{' '}
            {INTERVALS.find((i) => i.value === interval)?.label}.
          </p>
        </div>
      </div>
    );
  }

  const v = verdict(metrics);
  const status = statusBreakdown(metrics?.http?.responseStatus);
  const errorShare = status.find((r) => r.cls === '5xx')?.share ?? null;
  const http = metrics?.http;
  const system = metrics?.system;
  const tls = metrics?.tls;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {header}

      {error && (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Showing the figures from {clockTime(loadedAt)}. The last refresh failed: {error.replace(/\.?$/, '.')} Retrying in at most{' '}
          {INTERVALS.find((i) => i.value === interval)?.label}.
        </div>
      )}

      <section aria-labelledby="health-title" className="rounded-lg bg-white p-5 shadow-sm">
        <h2 id="health-title" className="sr-only">Health</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${TONE[v.tone]}`}>{v.label}</span>
          <p className="text-base text-gray-900">{v.text}</p>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-gray-200 pt-5 lg:grid-cols-4">
          <Stat label="Server errors (5xx)" value={formatPercent(errorShare)} />
          <Stat label="Average response time" value={formatDuration(http?.avgRequestDuration)} />
          <Stat label="Certificates managed" value={formatCount(tls?.certificatesTotal)} />
          <Stat label="Process memory" value={formatBytes(system?.memoryBytes)} />
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <HistoryChart
          title="Requests per minute"
          hint="Caddy is sampled about once an hour, so a chart needs two samples. Check back later."
          labels={labels}
          values={rates}
          format={perMinute}
          tickFormat={plainTick}
          unavailable={historyError}
        />
        <HistoryChart
          title="Process memory (MiB)"
          hint="Caddy is sampled about once an hour. The first samples appear after the next one."
          labels={labels}
          values={memory}
          format={mebibytes}
          tickFormat={plainTick}
          unavailable={historyError}
        />
      </div>

      <StatusBreakdown responseStatus={http?.responseStatus} />

      <section aria-labelledby="details-title" className="rounded-lg bg-white p-5 shadow-sm">
        <h2 id="details-title" className="text-base font-semibold text-gray-900">Details</h2>
        <p className="mt-1 text-sm text-gray-600">From Caddy&apos;s own metrics. Counts run since Caddy started.</p>
        <dl className="mt-3">
          <Detail label="Requests" value={formatCount(http?.requestsTotal)} />
          <Detail label="CPU time" note="Cumulative seconds, not a percentage" value={system?.cpuSeconds == null ? DASH : `${system.cpuSeconds.toFixed(2)} s`} />
          <Detail label="Concurrent tasks" note="Go routines inside Caddy" value={formatCount(system?.goroutines)} />
          <Detail label="TLS handshakes" value={formatCount(tls?.handshakesTotal)} />
        </dl>
      </section>
    </div>
  );
};

export default MetricsDashboard;
