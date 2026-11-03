import React from 'react';

/** A figure with its label; `note` is a short qualifier under the value */
export const Stat = ({ label, value, note }) => (
  <div className="min-w-0">
    <dt className="text-sm text-gray-700">{label}</dt>
    <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-gray-900">{value}</dd>
    {note && <dd className="mt-0.5 text-sm text-gray-600">{note}</dd>}
  </div>
);

/** A row of a details list */
export const Detail = ({ label, value, note }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-gray-200 py-3 last:border-0">
    <dt className="text-sm text-gray-700">
      {label}
      {note && <span className="block text-gray-600">{note}</span>}
    </dt>
    <dd className="shrink-0 font-mono text-sm tabular-nums text-gray-900">{value}</dd>
  </div>
);
