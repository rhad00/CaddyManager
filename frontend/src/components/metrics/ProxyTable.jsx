import React from 'react';
import { Link } from 'react-router-dom';
import { formatBytes, formatCount, formatDuration, formatPercent, DASH } from '../../utils/metricsModel';

/** Every proxy with its traffic, busiest first. A name opens that proxy's analytics. */
export default function ProxyTable({ rows, linkFor }) {
  if (rows.length === 0) {
    return (
      <section aria-labelledby="proxies-title" className="rounded-lg bg-white p-5 shadow-sm">
        <h3 id="proxies-title" className="text-base font-semibold text-gray-900">Proxies</h3>
        <p className="mt-3 text-sm text-gray-700">
          There are no proxies yet. Create one under Routing, then its traffic appears here.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="proxies-title" className="rounded-lg bg-white p-5 shadow-sm">
      <h3 id="proxies-title" className="text-base font-semibold text-gray-900">Proxies</h3>
      <p className="mt-1 text-sm text-gray-600">Select a proxy to see its own charts, paths and clients.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-700">
              <th scope="col" className="py-2 pr-3 font-medium">Proxy</th>
              <th scope="col" className="py-2 pr-3 font-medium">Requests</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Server errors</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Data served</th>
              <th scope="col" className="py-2 text-right font-medium">Avg response</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-200 last:border-0">
                <th scope="row" className="py-3 pr-3 text-left font-normal">
                  <Link to={linkFor(row.id)} className="font-medium text-indigo-700 underline-offset-2 hover:underline">
                    {row.name}
                  </Link>
                  {row.disabled && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-800">Disabled</span>}
                  <span className="block max-w-[16rem] truncate font-mono text-xs text-gray-600" title={row.domains.join(', ')}>
                    {row.domains.join(', ') || DASH}
                  </span>
                </th>
                <td className="py-3 pr-3 align-top">
                  <span className="font-mono tabular-nums text-gray-900">{formatCount(row.requests)}</span>
                  <span aria-hidden="true" className="mt-1.5 block h-1.5 w-28 rounded-full bg-gray-100">
                    <span className="block h-1.5 rounded-full bg-indigo-600" style={{ width: `${Math.max(row.share * 100, row.requests ? 2 : 0)}%` }} />
                  </span>
                  <span className="sr-only">{formatPercent(row.share)} of all requests</span>
                </td>
                <td className="py-3 pr-3 text-right align-top font-mono tabular-nums text-gray-900">{formatPercent(row.errorShare)}</td>
                <td className="py-3 pr-3 text-right align-top font-mono tabular-nums text-gray-900">{row.requests ? formatBytes(row.bytes) : DASH}</td>
                <td className="py-3 text-right align-top font-mono tabular-nums text-gray-900">{formatDuration(row.avgMs === null ? null : row.avgMs / 1000)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
