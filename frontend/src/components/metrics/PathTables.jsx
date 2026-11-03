import React, { useId } from 'react';
import { formatCount } from '../../utils/metricsModel';
import { percentileText } from '../../utils/trafficModel';

const Card = ({ title, note, children }) => {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-lg bg-white p-5 shadow-sm">
      <h3 id={id} className="text-base font-semibold text-gray-900">{title}</h3>
      {note && <p className="mt-1 text-sm text-gray-600">{note}</p>}
      {children}
    </section>
  );
};

const Path = ({ children }) => (
  <th scope="row" className="max-w-0 py-2.5 pr-3 text-left font-normal text-gray-900">
    <span className="block truncate font-mono text-xs" title={children}>{children}</span>
  </th>
);

/** Paths whose slowest responses are the slowest: the place to look when a proxy feels sluggish */
export function SlowPaths({ items }) {
  return (
    <Card title="Slowest paths" note="Where 95% of responses finished within the time shown. Paths with fewer than 5 requests are left out.">
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-700">Not enough requests in this period.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-700">
              <th scope="col" className="py-2 pr-3 font-medium">Path</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Requests</th>
              <th scope="col" className="py-2 text-right font-medium">95% within</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.key} className="border-b border-gray-200 last:border-0">
                <Path>{p.key}</Path>
                <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-gray-900">{formatCount(p.count)}</td>
                <td className="py-2.5 text-right font-mono tabular-nums text-gray-900">{percentileText(p.p95Ms)?.replace('up to ', '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/** Paths that answer with errors, server errors first */
export function ErrorPaths({ items }) {
  return (
    <Card title="Paths with errors" note="Server errors (5xx) first, then client errors (4xx such as 404).">
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-700">No errors in this period.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-700">
              <th scope="col" className="py-2 pr-3 font-medium">Path</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">5xx</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">4xx</th>
              <th scope="col" className="py-2 text-right font-medium">Requests</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.key} className="border-b border-gray-200 last:border-0">
                <Path>{p.key}</Path>
                <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-gray-900">{formatCount(p.errors5xx)}</td>
                <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-gray-900">{formatCount(p.errors4xx)}</td>
                <td className="py-2.5 text-right font-mono tabular-nums text-gray-900">{formatCount(p.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
