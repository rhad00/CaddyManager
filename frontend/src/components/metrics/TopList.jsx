import React, { useId } from 'react';
import { formatCount, formatPercent } from '../../utils/metricsModel';

/** The most requested paths or the busiest clients: a ranked table whose bars only repeat the numbers */
export default function TopList({ title, keyLabel, items, total, empty, mono = true }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-lg bg-white p-5 shadow-sm">
      <h3 id={id} className="text-base font-semibold text-gray-900">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-700">{empty}</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-700">
              <th scope="col" className="py-2 pr-3 font-medium">{keyLabel}</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Requests</th>
              <th scope="col" className="py-2 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ key, count }) => {
              const share = total ? count / total : 0;
              return (
                <tr key={key} className="border-b border-gray-200 last:border-0">
                  <th scope="row" className="max-w-0 py-2.5 pr-3 text-left font-normal text-gray-900">
                    <span className={`block truncate ${mono ? 'font-mono text-xs' : 'text-sm'}`} title={key}>{key}</span>
                    <span aria-hidden="true" className="mt-1.5 block h-1 rounded-full bg-gray-100">
                      <span className="block h-1 rounded-full bg-indigo-600" style={{ width: `${Math.max(share * 100, 1)}%` }} />
                    </span>
                  </th>
                  <td className="py-2.5 pr-3 text-right align-top font-mono tabular-nums text-gray-900">{formatCount(count)}</td>
                  <td className="py-2.5 text-right align-top font-mono tabular-nums text-gray-900">{formatPercent(share)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
