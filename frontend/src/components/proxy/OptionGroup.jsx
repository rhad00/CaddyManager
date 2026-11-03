import React from 'react';

/**
 * A collapsible group of options. Open state is owned by the form, so a failed check or a
 * template lock can open the group that holds the field. `enabledCount` is shown when closed,
 * so a closed group still says what is switched on.
 */
export default function OptionGroup({ title, summary, open, onToggle, enabledCount = 0, children }) {
  return (
    <details
      open={open}
      onToggle={(e) => onToggle(e.currentTarget.open)}
      className="group border-t border-gray-200 first:border-t-0"
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-gray-900">{title}</span>
          <span className="block text-sm text-gray-600">{summary}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {enabledCount > 0 && (
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
              {enabledCount} on
            </span>
          )}
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="size-5 text-gray-600 transition-transform group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <div className="space-y-6 pb-6 pt-1">{children}</div>
    </details>
  );
}
