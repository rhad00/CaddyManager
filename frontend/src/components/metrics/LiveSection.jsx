import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HistoryChart from './HistoryChart';
import { Stat } from './Stat';
import { get, apiError, describeError } from '../../utils/api';
import { formatCount } from '../../utils/metricsModel';

const POLL_MS = 5000;
const pad = (n) => String(n).padStart(2, '0');
const clock = (ts) => {
  const t = new Date(ts * 1000);
  return `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
};
const perSecond = (v) => `${v.toFixed(v < 10 ? 1 : 0)} requests/s`;
const tick = (v) => String(Number(v.toFixed(1)));

/** Status as a small pill: colour only ever marks the class, the number carries the meaning */
const statusClass = (s) => (s >= 500 ? 'text-red-800' : s >= 400 ? 'text-amber-800' : 'text-gray-900');

/** Requests of the last five minutes, from the end of the access log, refreshed on its own */
export default function LiveSection({ token }) {
  const [live, setLive] = useState(null);
  const [error, setError] = useState(null);
  const [paused, setPaused] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await get('/metrics/live', token);
      if (!response.ok) throw await apiError(response, 'load the live traffic');
      const data = await response.json();
      setLive(data.live ?? null);
      setError(null);
    } catch (err) {
      console.error('Error fetching live traffic:', err);
      setError(describeError(err, 'load the live traffic'));
    } finally {
      inFlight.current = false;
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (paused) return undefined;
    // A tab nobody is looking at does not read the log
    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [paused, refresh]);

  const labels = useMemo(
    () => (live ? live.series.requests.map((_, i) => clock(live.from + (i + 1) * live.stepSeconds)) : []),
    [live],
  );
  const values = useMemo(() => (live ? live.series.requests.map((n) => n / live.stepSeconds) : []), [live]);
  const errors = live ? live.series.serverErrors.reduce((a, b) => a + b, 0) : 0;

  return (
    <section aria-labelledby="live-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="live-title" className="text-xl font-semibold text-gray-900">Live</h2>
          <p className="mt-1 text-sm text-gray-600">The last 5 minutes, read from the end of the access log.</p>
        </div>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          className="rounded-md border border-edge px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          {paused ? 'Resume updates' : 'Pause updates'}
        </button>
      </div>

      {error && !live && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</p>
      )}
      {error && live && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {error} Showing the last figures that loaded.
        </p>
      )}
      {live && !live.available && (
        <p className="rounded-md border border-gray-300 bg-white p-4 text-sm text-gray-800">
          There is no access log to read yet, so there is nothing live to show.
        </p>
      )}
      {live && live.available && !live.coversWindow && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          The log is so busy that its end does not reach back 5 minutes. The figures cover only the latest part of it.
        </p>
      )}

      {live && live.available && (
        <>
          <div className="rounded-lg bg-white p-5 shadow-sm">
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3">
              <Stat label="Now" value={`${live.rate.toFixed(1)}/s`} note="Over the last 10 seconds" />
              <Stat label="Requests in 5 minutes" value={formatCount(live.total)} />
              <Stat label="Server errors in 5 minutes" value={formatCount(errors)} />
            </dl>
          </div>

          <HistoryChart
            title="Requests per second"
            hint="No requests in the last 5 minutes."
            labels={labels}
            values={values}
            format={perSecond}
            tickFormat={tick}
            empty={live.total === 0}
          />

          <div className="rounded-lg bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900">Latest requests</h3>
            <p className="mt-1 text-sm text-gray-600">Paths only. The query string is never shown.</p>
            {live.recent.length === 0 ? (
              <p className="mt-3 text-sm text-gray-700">No requests in the last 5 minutes.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-700">
                      <th scope="col" className="py-2 pr-3 font-medium">Time</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Host</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Request</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Status</th>
                      <th scope="col" className="py-2 text-right font-medium">Time taken</th>
                    </tr>
                  </thead>
                  <tbody>
                    {live.recent.map((r, i) => (
                      <tr key={`${r.ts}-${i}`} className="border-b border-gray-200 last:border-0">
                        <td className="py-2 pr-3 font-mono text-xs tabular-nums text-gray-900">{clock(r.ts)}</td>
                        <td className="max-w-[10rem] truncate py-2 pr-3 font-mono text-xs text-gray-900" title={r.host}>{r.host}</td>
                        <td className="max-w-[16rem] truncate py-2 pr-3 font-mono text-xs text-gray-900" title={`${r.method} ${r.path}`}>
                          {r.method} {r.path}
                        </td>
                        <td className={`py-2 pr-3 text-right font-mono tabular-nums ${statusClass(r.status)}`}>{r.status}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-gray-900">{r.ms === null ? '—' : `${r.ms} ms`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
