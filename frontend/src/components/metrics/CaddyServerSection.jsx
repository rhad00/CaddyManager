import React, { useMemo } from 'react';
import HistoryChart from './HistoryChart';
import { Stat, Detail } from './Stat';
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
} from '../../utils/metricsModel';

const TONE = {
  ok: 'bg-green-100 text-green-900',
  warn: 'bg-amber-100 text-amber-900',
  bad: 'bg-red-100 text-red-900',
  unknown: 'bg-gray-100 text-gray-800',
};

const perMinute = (v) => `${v.toFixed(v < 10 ? 1 : 0)} per min`;
const mebibytes = (v) => `${v.toFixed(1)} MiB`;
const plainTick = (v) => String(Number(v.toFixed(1)));

/** Caddy's own process metrics: is it healthy, how much it uses, and the hourly samples */
export default function CaddyServerSection({ metrics, history, historyError }) {
  const points = useMemo(() => historySeries(history), [history]);
  const labels = useMemo(() => timeLabels(points), [points]);
  const rates = useMemo(() => points.map((p) => p.perMinute), [points]);
  const memory = useMemo(() => points.map((p) => p.memoryMiB), [points]);

  const v = verdict(metrics);
  const errorShare = statusBreakdown(metrics?.http?.responseStatus).find((r) => r.cls === '5xx')?.share ?? null;
  const http = metrics?.http;
  const system = metrics?.system;
  const tls = metrics?.tls;

  return (
    <div className="space-y-6">
      <section aria-labelledby="health-title" className="rounded-lg bg-white p-5 shadow-sm">
        <h3 id="health-title" className="sr-only">Health</h3>
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

      <section aria-labelledby="details-title" className="rounded-lg bg-white p-5 shadow-sm">
        <h3 id="details-title" className="text-base font-semibold text-gray-900">Details</h3>
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
}
