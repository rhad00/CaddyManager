import React from 'react';

const PATHS = {
  route: 'M5 6.5a2 2 0 1 0 0-.01M5 6.5h8.5a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h6M19 18.5a2 2 0 1 0 0-.01',
  pulse: 'M3 12h4l2.5-6 4 12 2.5-6H21',
  server: 'M4 5h16v5.5H4zM4 13.5h16V19H4zM7.5 8h.01M7.5 16.5h.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-1.7 3-1.9-.7a7 7 0 0 1-1.7 1l-.3 2h-3.4l-.3-2a7 7 0 0 1-1.7-1l-1.9.7-1.7-3 1.6-1.2a7 7 0 0 1 0-2L4.3 10.3l1.7-3 1.9.7a7 7 0 0 1 1.7-1l.3-2h3.4l.3 2a7 7 0 0 1 1.7 1l1.9-.7 1.7 3-1.6 1.2a7 7 0 0 1 0 2z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 6l6 6-6 6',
};

/** A 20px stroke icon from the set above */
const Icon = ({ name, className = 'h-5 w-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <path d={PATHS[name]} />
  </svg>
);

/** The CaddyManager mark: a request that turns and passes through the gateway */
export const BrandMark = ({ className = 'h-8 w-8' }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
    <rect width="32" height="32" rx="7" fill="#0f3d3a" />
    <path d="M8 11.5h11.5a3.5 3.5 0 0 1 0 7H12" fill="none" stroke="#5fd6b4" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M15 15.5 11.5 18.5 15 21.5" fill="none" stroke="#5fd6b4" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default Icon;
