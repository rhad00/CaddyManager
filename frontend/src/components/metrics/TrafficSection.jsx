import React, { useMemo } from 'react';
import HistoryChart from './HistoryChart';
import RequestsChart from './RequestsChart';
import StatusBreakdown from './StatusBreakdown';
import TopList from './TopList';
import { Stat } from './Stat';
import { formatBytes, formatCount, formatDuration, formatPercent } from '../../utils/metricsModel';
import { bucketLabels, bytesPerSecond, responseTimes, errorShare, percentileText } from '../../utils/trafficModel';

const perSecond = (v) => `${formatBytes(v)}/s`;
const plainBytes = (v) => formatBytes(v);
const milliseconds = (v) => formatDuration(v / 1000);
const plainTick = (v) => String(Number(v.toFixed(0)));

/** The charts, figures and rankings of one scope: all proxies, one proxy or the other hosts */
export default function TrafficSection({ traffic, summary, afterRequests }) {
  const labels = useMemo(() => bucketLabels(traffic), [traffic]);
  const bandwidth = useMemo(() => bytesPerSecond(summary.series, traffic.bucketSeconds), [summary, traffic.bucketSeconds]);
  const latency = useMemo(() => responseTimes(summary.series), [summary]);
  const peak = Math.max(0, ...bandwidth);
  const p95 = percentileText(summary.p95Ms);
  const quiet = summary.requests === 0;

  return (
    <div className="space-y-6">
      <section aria-labelledby="traffic-figures" className="rounded-lg bg-white p-5 shadow-sm">
        <h3 id="traffic-figures" className="sr-only">Figures</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
          <Stat label="Requests" value={formatCount(summary.requests)} />
          <Stat label="Data served" value={summary.requests ? formatBytes(summary.bytes) : '—'} />
          <Stat label="Server errors (5xx)" value={formatPercent(errorShare(summary))} />
          <Stat
            label="Average response time"
            value={formatDuration(summary.avgMs === null ? null : summary.avgMs / 1000)}
            note={p95 ? `95% finished ${p95}` : undefined}
          />
        </dl>
      </section>

      <RequestsChart summary={summary} labels={labels} bucketSeconds={traffic.bucketSeconds} />

      {afterRequests}

      <div className="grid gap-6 lg:grid-cols-2">
        <HistoryChart
          title="Bandwidth"
          hint="No data was served in this period."
          labels={labels}
          values={bandwidth}
          format={perSecond}
          tickFormat={plainBytes}
          empty={quiet}
          footer={<p className="mt-3 text-sm text-gray-600">Busiest step <span className="font-mono text-gray-900">{perSecond(peak)}</span></p>}
        />
        <HistoryChart
          title="Response time"
          hint="No requests in this period."
          labels={labels}
          values={latency}
          format={milliseconds}
          tickFormat={plainTick}
          empty={quiet}
          footer={<p className="mt-3 text-sm text-gray-600">Average per step, in milliseconds. The figure above covers the whole period.</p>}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TopList title="Top paths" keyLabel="Path" items={summary.topPaths} total={summary.requests} empty="No requests in this period." />
        <TopList title="Top clients" keyLabel="IP address" items={summary.topClients} total={summary.requests} empty="No requests in this period." />
      </div>

      <StatusBreakdown responseStatus={summary.status} note="In the selected period." />
    </div>
  );
}
