import React, { useId, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { lineDataset, lineOptions } from './chartTheme';
import { DASH } from '../../utils/metricsModel';

// "2 Nov 13:45" becomes two lines, so neighbouring labels never touch
const twoLines = (label) => {
  const parts = label.split(' ');
  return parts.length === 3 ? [`${parts[0]} ${parts[1]}`, parts[2]] : label;
};

/**
 * One history series. The canvas has a name and a plain-text summary, so the numbers
 * reach a screen reader; a gap in the data stays a gap in the line.
 */
export default function HistoryChart({ title, hint, labels, values, format, tickFormat, unavailable, empty, footer }) {
  const headingId = useId();
  const options = useMemo(() => lineOptions(format, tickFormat), [format, tickFormat]);
  const data = useMemo(() => ({ labels: labels.map(twoLines), datasets: [lineDataset(title, values)] }), [labels, values, title]);

  const known = values.filter((v) => v !== null);
  const summary =
    known.length === 0
      ? `${title}: no data.`
      : `${title}: latest ${format(known[known.length - 1])}, from ${format(Math.min(...known))} to ${format(Math.max(...known))} over ${labels.length} samples, ${labels[0]} to ${labels[labels.length - 1]}.`;

  let body;
  if (unavailable) {
    body = <p role="alert" className="text-sm text-red-800">{unavailable}</p>;
  } else if (empty ?? known.length === 0) {
    body = <p className="text-sm text-gray-700">{hint}</p>;
  } else {
    body = (
      <div className="h-56">
        <Line data={data} options={options} role="img" aria-label={summary} />
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="rounded-lg bg-white p-5 shadow-sm">
      <h3 id={headingId} className="text-base font-semibold text-gray-900">{title}</h3>
      <div className="mt-4">{body}</div>
      {known.length > 0 && !(empty ?? false) && <p className="sr-only">{summary}</p>}
      {known.length > 0 && !(empty ?? false) && (footer ?? (
        <p className="mt-3 text-sm text-gray-600">
          Latest <span className="font-mono text-gray-900">{format(known[known.length - 1]) ?? DASH}</span>
        </p>
      ))}
    </section>
  );
}
