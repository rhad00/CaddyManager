import React, { useId, useMemo } from 'react';
import { heatmap } from '../../utils/trafficModel';
import { formatCount } from '../../utils/metricsModel';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const pad = (n) => String(n).padStart(2, '0');

/** One teal, five steps: the darker the cell, the more requests in that hour */
const STEPS = [0, 0.15, 0.35, 0.6, 0.85];
const stepOf = (count, max) => (!count || !max ? 0 : Math.min(STEPS.length - 1, Math.ceil((count / max) * (STEPS.length - 1))));
const fill = (count, max) => {
  const step = stepOf(count, max);
  return step === 0 ? '#eef1f3' : `rgba(14, 107, 99, ${STEPS[step]})`;
};

/** Requests by day and hour, in the viewer's own time zone */
export default function Heatmap({ detail }) {
  const id = useId();
  const grid = useMemo(() => heatmap(detail), [detail]);
  if (grid.days.length === 0) return null;

  const summary = grid.busiest
    ? `Busiest hour: ${grid.busiest.day} at ${pad(grid.busiest.hour)}:00 with ${formatCount(grid.busiest.count)} requests.`
    : 'No requests in this period.';

  return (
    <section aria-labelledby={id} className="rounded-lg bg-white p-5 shadow-sm">
      <h3 id={id} className="text-base font-semibold text-gray-900">Busiest hours</h3>
      <p className="mt-1 text-sm text-gray-600">Requests per hour, in your local time. {summary}</p>

      <div className="mt-4 overflow-x-auto">
        <div role="img" aria-label={`Requests by day and hour. ${summary}`} className="min-w-[36rem]">
          <div className="ml-14 grid gap-0.5 text-xs text-gray-600" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }} aria-hidden="true">
            {HOURS.map((h) => (
              <span key={h} className="text-center">{h % 6 === 0 ? pad(h) : ''}</span>
            ))}
          </div>
          {grid.days.map((day) => (
            <div key={day.key} className="mt-0.5 flex items-center gap-0.5">
              <span className="w-14 shrink-0 text-xs text-gray-700" aria-hidden="true">{day.label}</span>
              <div className="grid flex-1 gap-0.5" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                {day.cells.map((cell, hour) => (
                  <span
                    key={hour}
                    title={cell ? `${day.label} ${pad(hour)}:00, ${formatCount(cell.count)} requests` : `${day.label} ${pad(hour)}:00, no data`}
                    className="h-5 rounded-sm"
                    style={{ backgroundColor: cell ? fill(cell.count, grid.max) : 'transparent', border: cell ? 'none' : '1px dashed #e0e5e9' }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-gray-700" aria-hidden="true">
        <span>0</span>
        {STEPS.map((a, i) => (
          <span key={a} className="h-3 w-6 rounded-sm" style={{ backgroundColor: i === 0 ? '#eef1f3' : `rgba(14, 107, 99, ${a})` }} />
        ))}
        <span>{formatCount(grid.max)} requests in an hour</span>
      </div>
    </section>
  );
}
