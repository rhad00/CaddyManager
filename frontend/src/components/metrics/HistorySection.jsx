import React, { useEffect, useMemo, useState } from 'react';
import HistoryChart from './HistoryChart';
import { get, apiError, describeError } from '../../utils/api';
import { formatBytes, formatCount, formatDuration } from '../../utils/metricsModel';
import { HISTORY_RANGES, DEFAULT_HISTORY_RANGE, dayLabels, withGaps, coveredDays, bytesPerDay, avgTimes } from '../../utils/historyModel';
import { Stat } from './Stat';

const perDay = (v) => `${formatCount(Math.round(v))} requests`;
const count = (v) => String(Math.round(v));
const milliseconds = (v) => formatDuration(v / 1000);
const plain = (v) => String(Number(v.toFixed(0)));

/** Daily traffic for 30 or 90 days, from hourly totals kept after the access log rotates */
export default function HistorySection({ token, proxyId, scopeName }) {
  const [range, setRange] = useState(DEFAULT_HISTORY_RANGE);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const scope = proxyId ? `&proxy=${encodeURIComponent(proxyId)}` : '';
        const response = await get(`/metrics/history?range=${range}${scope}`, token);
        if (!response.ok) throw await apiError(response, 'load the history');
        const data = await response.json();
        if (!cancelled) {
          setHistory(data.history ?? null);
          setError(null);
        }
      } catch (err) {
        console.error('Error fetching traffic history:', err);
        if (!cancelled) setError(describeError(err, 'load the history'));
      }
    })();
    return () => { cancelled = true; };
  }, [token, range, proxyId]);

  const labels = useMemo(() => dayLabels(history), [history]);
  const requests = useMemo(() => withGaps(history?.series?.requests, history), [history]);
  const serverErrors = useMemo(() => withGaps(history?.series?.serverError, history), [history]);
  const bytes = useMemo(() => bytesPerDay(history), [history]);
  const times = useMemo(() => avgTimes(history), [history]);
  const days = coveredDays(history);
  const empty = !history || days === null || history.totals.requests === 0;

  return (
    <section aria-labelledby="history-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="history-title" className="text-xl font-semibold text-gray-900">Long-term traffic</h2>
          <p className="mt-1 text-sm text-gray-600">
            {scopeName} per day, in UTC days. Hourly totals are kept after the access log rotates away.
          </p>
        </div>
        <div role="group" aria-label="History period" className="inline-flex overflow-hidden rounded-md border border-edge">
          {HISTORY_RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={range === r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-600 ${
                range === r.value ? 'bg-indigo-600 text-white' : 'bg-white text-gray-800 hover:bg-gray-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</p>}

      {history && days === null && (
        <p className="rounded-md border border-gray-300 bg-white p-4 text-sm text-gray-800">
          Nothing is stored yet. Totals are saved once an hour is over, starting from the first full hour in the access log.
        </p>
      )}
      {history && days !== null && days < history.series.requests.length && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Stored data reaches back {days} {days === 1 ? 'day' : 'days'}. Earlier days are left blank because they are unknown, not quiet.
        </p>
      )}

      {history && days !== null && (
        <>
          <div className="rounded-lg bg-white p-5 shadow-sm">
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat label="Requests" value={formatCount(history.totals.requests)} />
              <Stat label="Server errors (5xx)" value={formatCount(history.totals.serverErrors)} />
              <Stat label="Data served" value={formatBytes(history.totals.bytes)} />
              <Stat label="Average response time" value={formatDuration(history.totals.avgMs === null ? null : history.totals.avgMs / 1000)} />
            </dl>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <HistoryChart title="Requests per day" hint="No requests in this period." labels={labels} values={requests} format={perDay} tickFormat={plain} empty={empty} />
            <HistoryChart title="Server errors per day" hint="No server errors in this period." labels={labels} values={serverErrors} format={(v) => `${count(v)} errors`} tickFormat={plain} empty={empty || serverErrors.every((v) => !v)} />
            <HistoryChart title="Data served per day" hint="No data was served in this period." labels={labels} values={bytes} format={(v) => formatBytes(v)} tickFormat={(v) => formatBytes(v)} empty={empty} />
            <HistoryChart title="Response time" hint="No requests in this period." labels={labels} values={times} format={milliseconds} tickFormat={plain} empty={empty} />
          </div>
        </>
      )}
    </section>
  );
}
