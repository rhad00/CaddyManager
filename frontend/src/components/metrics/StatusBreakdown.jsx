import React from 'react';
import { statusBreakdown, formatCount, formatPercent, DASH } from '../../utils/metricsModel';

const BAR = { '2xx': 'bg-green-600', '3xx': 'bg-blue-600', '4xx': 'bg-amber-600', '5xx': 'bg-red-600' };
const NAME = { '2xx': 'Success', '3xx': 'Redirect', '4xx': 'Client error', '5xx': 'Server error' };

/** Responses by status class as a table: the numbers are text, the bar only repeats them */
export default function StatusBreakdown({ responseStatus }) {
  const rows = statusBreakdown(responseStatus);
  return (
    <section aria-labelledby="status-breakdown" className="rounded-lg bg-white p-5 shadow-sm">
      <h2 id="status-breakdown" className="text-base font-semibold text-gray-900">Responses by status</h2>
      <p className="mt-1 text-sm text-gray-600">Counted since Caddy started.</p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-700">
            <th scope="col" className="py-2 pr-3 font-medium">Class</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Responses</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Share</th>
            <th scope="col" className="hidden w-1/3 py-2 sm:table-cell"><span className="sr-only">Proportion</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ cls, count, share }) => (
            <tr key={cls} className="border-b border-gray-200 last:border-0">
              <th scope="row" className="py-3 pr-3 text-left font-normal text-gray-900">
                <span className="font-mono">{cls}</span> <span className="text-gray-600">{NAME[cls]}</span>
              </th>
              <td className="py-3 pr-3 text-right font-mono text-gray-900">{formatCount(count)}</td>
              <td className="py-3 pr-3 text-right font-mono text-gray-900">{share === null ? DASH : formatPercent(share)}</td>
              <td className="hidden py-3 sm:table-cell" aria-hidden="true">
                <div className="h-2 rounded-full bg-gray-100">
                  <div className={`h-2 rounded-full ${BAR[cls]}`} style={{ width: `${Math.max((share ?? 0) * 100, share ? 1 : 0)}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
