import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { get, apiError, describeError } from '../utils/api';
import TrafficSection from '../components/metrics/TrafficSection';
import ProxyTable from '../components/metrics/ProxyTable';
import CaddyServerSection from '../components/metrics/CaddyServerSection';
import { ageText, clockTime } from '../utils/metricsModel';
import { RANGES, DEFAULT_RANGE, OTHER_ID, isRange, scopeOf, proxyRows } from '../utils/trafficModel';

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

const intervalLabel = (seconds) => INTERVALS.find((i) => i.value === seconds)?.label;

async function load(path, token, action) {
  const response = await get(path, token);
  if (!response.ok) throw await apiError(response, action);
  return response.json();
}

const MetricsDashboard = () => {
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();
  const range = isRange(params.get('range')) ? params.get('range') : DEFAULT_RANGE;
  const proxyId = params.get('proxy');

  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState([]);
  const [traffic, setTraffic] = useState(null);
  const [errors, setErrors] = useState({ metrics: null, history: null, traffic: null });
  const [refreshing, setRefreshing] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);
  const [interval, setIntervalSeconds] = useState(readInterval);
  const [now, setNow] = useState(Date.now());
  const inFlight = useRef(false);

  // One refresh loads Caddy's figures, its history and the traffic, so the page never shows two ages
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    const next = { metrics: null, history: null, traffic: null };
    let ok = false;

    try {
      const data = await load('/metrics', token, 'load metrics');
      setMetrics(data.metrics ?? null);
      ok = true;
    } catch (err) {
      console.error('Error fetching metrics:', err);
      next.metrics = describeError(err, 'load the metrics');
    }
    try {
      const data = await load('/metrics/historical?limit=24', token, 'load the history');
      setHistory(Array.isArray(data.metrics) ? data.metrics : []);
    } catch (err) {
      console.error('Error fetching historical metrics:', err);
      next.history = describeError(err, 'load the history');
    }
    try {
      const data = await load(`/metrics/traffic?range=${range}`, token, 'load the traffic');
      setTraffic(data.traffic ?? null);
      ok = true;
    } catch (err) {
      console.error('Error fetching traffic:', err);
      next.traffic = describeError(err, 'load the traffic');
    }

    setErrors(next);
    if (ok) setLoadedAt(Date.now());
    inFlight.current = false;
    setRefreshing(false);
    setLoadedOnce(true);
  }, [token, range]);

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

  const update = useCallback(
    (changes) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined || (key === 'range' && value === DEFAULT_RANGE)) next.delete(key);
        else next.set(key, value);
      }
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const linkFor = useCallback(
    (id) => {
      const next = new URLSearchParams(params);
      if (id) next.set('proxy', id);
      else next.delete('proxy');
      const text = next.toString();
      return { search: text ? `?${text}` : '' };
    },
    [params],
  );

  const scope = useMemo(() => scopeOf(traffic, proxyId), [traffic, proxyId]);
  const rows = useMemo(() => proxyRows(traffic), [traffic]);
  const unknownProxy = Boolean(proxyId && traffic && !scope);
  const shown = scope ?? scopeOf(traffic, null);

  const noData = !metrics && !traffic;

  const header = (
    <div className="space-y-4">
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

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div>
          <label htmlFor="proxy-scope" className="block text-sm font-medium text-gray-800">Proxy</label>
          <select
            id="proxy-scope"
            value={scope?.id ?? ''}
            onChange={(e) => update({ proxy: e.target.value || null })}
            className="mt-1 block min-h-11 w-full min-w-[14rem] rounded-md border border-edge bg-white px-3 text-sm text-gray-900 sm:w-auto"
          >
            <option value="">All proxies</option>
            {(traffic?.proxies || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            {traffic?.other && <option value={OTHER_ID}>Other hosts</option>}
          </select>
        </div>
        <fieldset>
          <legend className="block text-sm font-medium text-gray-800">Period</legend>
          <div className="mt-1 inline-flex overflow-hidden rounded-md border border-edge bg-white">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-pressed={r.value === range}
                onClick={() => update({ range: r.value })}
                className={`min-h-11 border-l border-edge px-3 text-sm first:border-l-0 ${
                  r.value === range ? 'bg-indigo-600 font-medium text-white' : 'text-gray-900 hover:bg-gray-50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </fieldset>
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

  if (noData) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {header}
        <div role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p>{errors.metrics || errors.traffic}</p>
          <p className="mt-1">
            Check that the CaddyManager backend and Caddy are running, then try again. This page retries on its own every{' '}
            {intervalLabel(interval)}.
          </p>
        </div>
      </div>
    );
  }

  // Only a failed refresh of figures that are on screen is "old data"; a section that never loaded has its own message
  const stale = (metrics && errors.metrics) || (traffic && errors.traffic) || null;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      {header}

      {stale && (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Some figures are from {clockTime(loadedAt)} or earlier. The last refresh failed: {stale.replace(/\.?$/, '.')} Retrying in at most{' '}
          {intervalLabel(interval)}.
        </div>
      )}

      <section aria-labelledby="traffic-title" className="space-y-6">
        <div>
          {scope?.id ? (
            <>
              <Link to={linkFor(null)} className="inline-flex min-h-11 items-center text-sm font-medium text-indigo-700 hover:underline">
                Back to all proxies
              </Link>
              <h2 id="traffic-title" className="text-xl font-semibold text-gray-900">{scope.name}</h2>
              {scope.domains.length > 0 && (
                <p className="mt-1 break-words font-mono text-sm text-gray-700">{scope.domains.join(', ')}</p>
              )}
            </>
          ) : (
            <h2 id="traffic-title" className="text-xl font-semibold text-gray-900">Traffic</h2>
          )}
        </div>

        {unknownProxy && (
          <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            That proxy no longer exists, so all proxies are shown.
          </p>
        )}

        {errors.traffic && !traffic && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">{errors.traffic}</p>
        )}

        {traffic && !traffic.available && (
          <p className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-800">
            There is no access log yet. These charts are built from Caddy&apos;s access log, which appears once Caddy has served its first request.
          </p>
        )}

        {traffic && traffic.available && !traffic.coversWindow && (
          <p className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-800">
            The access log does not reach back this far, so the start of the charts is empty.
          </p>
        )}

        {traffic && shown && traffic.available && (
          <TrafficSection
            traffic={traffic}
            summary={shown.summary}
            afterRequests={shown.id ? null : <ProxyTable rows={rows} linkFor={linkFor} />}
          />
        )}
      </section>

      <section aria-labelledby="server-title" className="space-y-6">
        <div>
          <h2 id="server-title" className="text-xl font-semibold text-gray-900">Caddy server</h2>
          <p className="mt-1 text-sm text-gray-600">The Caddy process itself, from its own metrics.</p>
        </div>
        {errors.metrics && !metrics ? (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">{errors.metrics}</p>
        ) : (
          <CaddyServerSection metrics={metrics} history={history} historyError={errors.history} />
        )}
      </section>
    </div>
  );
};

export default MetricsDashboard;
