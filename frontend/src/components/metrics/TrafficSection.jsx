import React, { useMemo } from 'react';
import HistoryChart from './HistoryChart';
import RequestsChart from './RequestsChart';
import StatusBreakdown from './StatusBreakdown';
import TopList from './TopList';
import Heatmap from './Heatmap';
import AlertsList from './AlertsList';
import { SlowPaths, ErrorPaths } from './PathTables';
import { Stat } from './Stat';
import { formatBytes, formatCount, formatDuration, formatPercent } from '../../utils/metricsModel';
import {
  bucketLabels,
  bytesPerSecond,
  responseTimes,
  errorShare,
  percentileText,
  changeText,
  pointsChange,
} from '../../utils/trafficModel';
import { alertMarkers, inWindow } from '../../utils/alertModel';

const perSecond = (v) => `${formatBytes(v)}/s`;
const plainBytes = (v) => formatBytes(v);
const milliseconds = (v) => formatDuration(v / 1000);
const plainTick = (v) => String(Number(v.toFixed(0)));
const people = (v) => `${formatCount(Math.round(v))} visitors`;

const KIND_NAMES = { browser: 'Browsers', bot: 'Bots and scanners', tool: 'Tools and apps', unknown: 'Unknown' };
const named = (items, names) => items.map((i) => ({ ...i, key: names[i.key] ?? i.key }));
const capitalised = (items) => items.map((i) => ({ ...i, key: i.key.charAt(0).toUpperCase() + i.key.slice(1) }));

const NO_ALERTS = [];

/** The charts, figures and rankings of one scope: all proxies, one proxy or the other hosts */
export default function TrafficSection({ traffic, summary, afterRequests, alerts = NO_ALERTS, showAlertProxy = false }) {
  const { range } = traffic;
  const detail = summary.detail;
  const labels = useMemo(() => bucketLabels(traffic), [traffic]);
  const bandwidth = useMemo(() => bytesPerSecond(summary.series, traffic.bucketSeconds), [summary, traffic.bucketSeconds]);
  const latency = useMemo(() => responseTimes(summary.series), [summary]);
  const visitorsSeries = useMemo(() => detail?.visitorsSeries ?? [], [detail]);
  const peak = Math.max(0, ...bandwidth);
  const p95 = percentileText(summary.p95Ms);
  const quiet = summary.requests === 0;
  const previous = summary.previous;
  const share = errorShare(summary);
  const previousShare = previous ? errorShare({ status: { '2xx': previous.requests - previous.errors5xx, '5xx': previous.errors5xx } }) : null;
  const count = summary.series.requests.length;
  const markers = useMemo(() => alertMarkers(alerts, { from: traffic.from, bucketSeconds: traffic.bucketSeconds, count }), [alerts, traffic.from, traffic.bucketSeconds, count]);
  const windowAlerts = useMemo(() => inWindow(alerts, traffic), [alerts, traffic]);
  const browserRequests = detail?.clientKinds.find((k) => k.key === 'browser')?.count ?? 0;

  return (
    <div className="space-y-6">
      <section aria-labelledby="traffic-figures" className="rounded-lg bg-white p-5 shadow-sm">
        <h3 id="traffic-figures" className="sr-only">Figures</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 xl:grid-cols-5">
          <Stat label="Requests" value={formatCount(summary.requests)} note={changeText(summary.requests, previous?.requests, range)} />
          <Stat
            label="Visitors"
            value={detail ? formatCount(detail.visitors) : '—'}
            note={detail ? changeText(detail.visitors, previous?.visitors, range) ?? 'Distinct IP addresses' : undefined}
          />
          <Stat
            label="Data served"
            value={summary.requests ? formatBytes(summary.bytes) : '—'}
            note={changeText(summary.bytes, previous?.bytes, range) ?? (summary.bytesIn ? `${formatBytes(summary.bytesIn)} received` : undefined)}
          />
          <Stat label="Server errors (5xx)" value={formatPercent(share)} note={pointsChange(share, previousShare, range)} />
          <Stat
            label="Average response time"
            value={formatDuration(summary.avgMs === null ? null : summary.avgMs / 1000)}
            note={changeText(summary.avgMs, previous?.avgMs, range) ?? (p95 ? `95% finished ${p95}` : undefined)}
          />
        </dl>
        {previous === null && (
          <p className="mt-5 border-t border-gray-200 pt-4 text-sm text-gray-600">
            The access log does not reach back far enough to compare with the period before.
          </p>
        )}
      </section>

      <RequestsChart summary={summary} labels={labels} bucketSeconds={traffic.bucketSeconds} markers={markers} />

      <AlertsList events={windowAlerts} showProxy={showAlertProxy} />

      {afterRequests}

      <div className="grid gap-6 lg:grid-cols-2">
        <HistoryChart
          title="Visitors"
          hint="No visitors in this period."
          labels={labels}
          values={visitorsSeries}
          format={people}
          tickFormat={plainTick}
          empty={quiet || !detail}
          footer={<p className="mt-3 text-sm text-gray-600">Distinct IP addresses in each step. A visitor who returns in a later step counts again, so the figure above is lower than the sum.</p>}
        />
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
        {range === '7d' && detail ? <Heatmap detail={detail} /> : null}
      </div>

      {detail && !quiet && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <TopList title="Client type" keyLabel="Type" mono={false} items={named(detail.clientKinds, KIND_NAMES)} total={summary.requests} empty="No requests in this period." />
            <TopList title="Devices" keyLabel="Device" mono={false} items={capitalised(detail.devices)} total={browserRequests} empty="No browser requests in this period." />
            <TopList title="Browsers and clients" keyLabel="Name" mono={false} items={detail.browsers} total={summary.requests} empty="No requests in this period." />
            <TopList title="Operating systems" keyLabel="System" mono={false} items={detail.systems} total={summary.requests} empty="No requests in this period." />
            <TopList title="Referrers" keyLabel="Site" items={detail.referrers} total={summary.requests} empty="No request named the site it came from." />
            <TopList title="Request methods" keyLabel="Method" items={detail.methods} total={summary.requests} empty="No requests in this period." />
            <TopList title="HTTP versions" keyLabel="Version" mono={false} items={detail.protocols} total={summary.requests} empty="No requests in this period." />
            <TopList title="TLS versions" keyLabel="Version" mono={false} items={detail.tls} total={summary.requests} empty="No requests in this period." />
            <TopList title="TLS ciphers" keyLabel="Cipher" items={detail.ciphers} total={summary.requests} empty="No encrypted requests in this period." />
            <TopList title="Content types" keyLabel="Type" mono={false} items={detail.contentTypes} total={summary.requests} empty="No requests in this period." />
            <TopList title="Top paths" keyLabel="Path" items={detail.topPaths} total={summary.requests} empty="No requests in this period." />
            <TopList title="Top clients" keyLabel="IP address" items={detail.topClients} total={summary.requests} empty="No requests in this period." />
            <SlowPaths items={detail.slowPaths} />
            <ErrorPaths items={detail.errorPaths} />
          </div>

          <section aria-labelledby="blocked-title" className="rounded-lg bg-white p-5 shadow-sm">
            <h3 id="blocked-title" className="text-base font-semibold text-gray-900">Blocked and limited requests</h3>
            <p className="mt-1 text-sm text-gray-600">
              Counted from the status codes 401, 403 and 429. The log does not say which rule answered, so a 403 from the
              upstream itself is counted too.
            </p>
            <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Stat label="Not signed in (401)" value={formatCount(detail.blocked.unauthorized)} />
              <Stat label="Forbidden (403)" value={formatCount(detail.blocked.forbidden)} />
              <Stat label="Rate limited (429)" value={formatCount(detail.blocked.rateLimited)} />
            </dl>
          </section>
        </>
      )}

      <StatusBreakdown responseStatus={summary.status} note="In the selected period." />
    </div>
  );
}
