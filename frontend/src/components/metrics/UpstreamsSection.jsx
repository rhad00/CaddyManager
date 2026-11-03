import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, apiError, describeError } from '../../utils/api';
import { ageText, formatCount } from '../../utils/metricsModel';

const STATES = {
  down: { text: 'Not reachable', tone: 'text-red-800', dot: 'bg-red-600' },
  failing: { text: 'Reachable, with failures', tone: 'text-amber-800', dot: 'bg-amber-600' },
  up: { text: 'Reachable', tone: 'text-gray-900', dot: 'bg-indigo-600' },
  unknown: { text: 'Unknown', tone: 'text-gray-700', dot: 'bg-gray-400' },
};

/** Whether each upstream of the active proxies answers, with the counters Caddy keeps for it */
export default function UpstreamsSection({ token }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const response = await get('/metrics/upstreams', token);
      if (!response.ok) throw await apiError(response, 'check the upstreams');
      const data = await response.json();
      setReport(data.upstreams ?? null);
      setError(null);
    } catch (err) {
      console.error('Error fetching upstream health:', err);
      setError(describeError(err, 'check the upstreams'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    check();
  }, [check]);

  const rows = report?.rows ?? [];
  const down = rows.filter((r) => r.state === 'down').length;

  return (
    <section aria-labelledby="upstreams-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="upstreams-title" className="text-xl font-semibold text-gray-900">Upstreams</h2>
          <p className="mt-1 text-sm text-gray-600">
            Whether each upstream of an active proxy accepts a connection from CaddyManager.
            {rows.length > 0 && (down === 0 ? ' All of them do.' : ` ${down} ${down === 1 ? 'does' : 'do'} not.`)}
          </p>
        </div>
        <button
          type="button"
          onClick={check}
          disabled={loading}
          className="rounded-md border border-edge px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          {loading ? 'Checking…' : 'Check again'}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</p>
      )}
      {report && !report.caddyAvailable && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Caddy&apos;s admin API could not be read, so requests in flight and failures are not shown. Reachability still is.
        </p>
      )}
      {report && rows.length === 0 && (
        <p className="rounded-md border border-gray-300 bg-white p-4 text-sm text-gray-800">
          No active proxy has an upstream to check.
        </p>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-700">
                  <th scope="col" className="py-2 pr-3 font-medium">Proxy</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Upstream</th>
                  <th scope="col" className="py-2 pr-3 font-medium">State</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Connect time</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">In flight</th>
                  <th scope="col" className="py-2 text-right font-medium">Failures</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = STATES[r.state] ?? STATES.unknown;
                  return (
                    <tr key={`${r.proxyId}-${r.dial}`} className="border-b border-gray-200 last:border-0">
                      <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                        <Link to={`/metrics?proxy=${encodeURIComponent(r.proxyId)}`} className="underline">{r.proxyName}</Link>
                      </th>
                      <td className="py-2.5 pr-3 font-mono text-xs text-gray-900">{r.dial}</td>
                      <td className={`py-2.5 pr-3 ${s.tone}`}>
                        <span className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${s.dot}`} aria-hidden="true" />
                        {s.text}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-gray-900">{r.probeMs === null ? '—' : `${r.probeMs} ms`}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-gray-900">{r.inFlight === null ? '—' : formatCount(r.inFlight)}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-gray-900">{r.fails === null ? '—' : formatCount(r.fails)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-4 border-t border-gray-200 pt-3 text-sm text-gray-600">
            Checked {ageText(new Date(report.checkedAt).getTime())} with a TCP connect, which shows that something is
            listening but not that it answers correctly. Failures are counted by Caddy and stay at 0 unless the proxy
            has passive health checks.
          </p>
        </div>
      )}
    </section>
  );
}
