import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
} from 'chart.js';

// Only what the history charts draw, so the bundle stays small
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip);

// The design system's tokens (DESIGN.md): gateway teal for the one series, hairline for the grid
export const CHART_COLORS = {
  line: '#0e6b63',
  fill: 'rgba(14, 107, 99, 0.10)',
  grid: '#e0e5e9',
  text: '#4b5762',
  ink: '#16212b',
};

ChartJS.defaults.font.family = "'IBM Plex Sans Variable', ui-sans-serif, system-ui, sans-serif";
ChartJS.defaults.font.size = 12;
ChartJS.defaults.color = CHART_COLORS.text;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export function lineDataset(label, data) {
  return {
    label,
    data,
    borderColor: CHART_COLORS.line,
    backgroundColor: CHART_COLORS.fill,
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0,
    fill: true,
    spanGaps: false, // a missing sample is a gap, not a zero
  };
}

/** `format` turns a y value into the text of the axis and the tooltip */
export function lineOptions(format, tickFormat = format) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: prefersReducedMotion() ? false : undefined,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false }, // one series: the chart title is its label
      tooltip: {
        backgroundColor: CHART_COLORS.ink,
        displayColors: false,
        callbacks: { label: (ctx) => format(ctx.parsed.y) },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 4 },
      },
      y: {
        beginAtZero: true,
        grid: { color: CHART_COLORS.grid },
        border: { display: false },
        ticks: { callback: (value) => tickFormat(value), maxTicksLimit: 5 },
      },
    },
  };
}

/** Status classes, in stacking order. 2xx is the accent; the others only mark what went wrong or moved. */
export const STATUS_SERIES = [
  { key: 'ok', cls: '2xx', label: 'Success', color: CHART_COLORS.line },
  { key: 'redirect', cls: '3xx', label: 'Redirect', color: '#93a0ab' },
  { key: 'clientError', cls: '4xx', label: 'Client error', color: '#d97706' },
  { key: 'serverError', cls: '5xx', label: 'Server error', color: '#dc2626' },
];

/**
 * A dashed vertical line and a small diamond at the top for each step an alert fired in.
 * Steps come from `options.plugins.alertMarkers.indexes`; the list under the chart names them.
 */
export const alertMarkerPlugin = {
  id: 'alertMarkers',
  afterDatasetsDraw(chart, _args, opts) {
    const indexes = opts?.indexes;
    if (!Array.isArray(indexes) || indexes.length === 0) return;
    const { ctx, chartArea, scales } = chart;
    if (!scales.x || !chartArea) return;
    ctx.save();
    ctx.strokeStyle = CHART_COLORS.ink;
    ctx.fillStyle = CHART_COLORS.ink;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    for (const index of indexes) {
      const x = scales.x.getPixelForValue(index);
      if (!Number.isFinite(x) || x < chartArea.left || x > chartArea.right) continue;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top + 6);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x + 4, chartArea.top + 5);
      ctx.lineTo(x, chartArea.top + 10);
      ctx.lineTo(x - 4, chartArea.top + 5);
      ctx.closePath();
      ctx.fill();
      ctx.setLineDash([4, 3]);
    }
    ctx.restore();
  },
};

export function stackedBarOptions(format, markerIndexes = []) {
  const base = lineOptions(format);
  return {
    ...base,
    plugins: { ...base.plugins, alertMarkers: { indexes: markerIndexes } },
    scales: {
      x: { ...base.scales.x, stacked: true },
      y: { ...base.scales.y, stacked: true },
    },
  };
}
