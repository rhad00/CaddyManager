import React, { useId } from 'react';
import { conditionLabel } from '../../utils/alertModel';
import { clockTime } from '../../utils/metricsModel';

const when = (iso) => {
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })} ${clockTime(d)}`;
};

/** The alerts that fired in the period shown: the text behind the dashed lines on the chart */
export default function AlertsList({ events, showProxy }) {
  const id = useId();
  if (events.length === 0) return null;
  return (
    <section aria-labelledby={id} className="rounded-lg bg-white p-5 shadow-sm">
      <h3 id={id} className="text-base font-semibold text-gray-900">Alerts in this period</h3>
      <p className="mt-1 text-sm text-gray-600">Each one is marked with a dashed line on the Requests chart.</p>
      <ul className="mt-3 divide-y divide-gray-200">
        {events.map((e) => (
          <li key={e.id} className="grid gap-x-4 gap-y-0.5 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <span className="font-mono text-xs tabular-nums text-gray-700">{when(e.firedAt)}</span>
            <span className="text-sm text-gray-900">
              <span className="font-medium">{conditionLabel(e.conditionType)}</span>
              {showProxy && <> · {e.proxyName}</>}
              <span className="block text-gray-600">{e.summary}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
