import React, { useId, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { STATUS_SERIES, stackedBarOptions } from './chartTheme';
import { formatCount } from '../../utils/metricsModel';

const countFormat = (v) => formatCount(Math.round(v));

/**
 * Requests over time, stacked by status class. The legend carries the totals, so each class
 * is told by its name and count, not by colour alone.
 */
export default function RequestsChart({ summary, labels, bucketSeconds, unavailable }) {
  const headingId = useId();
  const options = useMemo(() => stackedBarOptions(countFormat), []);
  const data = useMemo(
    () => ({
      labels: labels.map((l) => (l.split(' ').length === 3 ? [l.split(' ').slice(0, 2).join(' '), l.split(' ')[2]] : l)),
      datasets: STATUS_SERIES.map(({ key, label, color }) => ({
        label,
        data: summary.series[key],
        backgroundColor: color,
        borderWidth: 0,
        borderRadius: 1,
        categoryPercentage: 1,
        barPercentage: 0.9,
      })),
    }),
    [summary, labels],
  );

  const peak = Math.max(0, ...summary.series.requests);
  const empty = summary.requests === 0;
  const bucketText = bucketSeconds >= 3600 ? `${bucketSeconds / 3600} h` : `${bucketSeconds / 60} min`;
  const description = `Requests over time, in ${bucketText} steps: ${formatCount(summary.requests)} in total, ${STATUS_SERIES.map(
    ({ cls, label }) => `${formatCount(summary.status[cls])} ${label.toLowerCase()}`,
  ).join(', ')}. Busiest step ${formatCount(peak)} requests.`;

  let body;
  if (unavailable) body = <p role="alert" className="text-sm text-red-800">{unavailable}</p>;
  else if (empty) body = <p className="text-sm text-gray-700">No requests in this period.</p>;
  else {
    body = (
      <div className="h-64">
        <Bar data={data} options={options} role="img" aria-label={description} />
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="rounded-lg bg-white p-5 shadow-sm">
      <h3 id={headingId} className="text-base font-semibold text-gray-900">Requests</h3>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {STATUS_SERIES.map(({ cls, label, color }) => (
          <li key={cls} className="flex items-center gap-2 text-gray-800">
            <span aria-hidden="true" className="size-3 rounded-sm" style={{ backgroundColor: color }} />
            <span>{label} <span className="font-mono text-gray-600">{cls}</span></span>
            <span className="font-mono tabular-nums text-gray-900">{formatCount(summary.status[cls])}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4">{body}</div>
      {!empty && !unavailable && <p className="sr-only">{description}</p>}
    </section>
  );
}
