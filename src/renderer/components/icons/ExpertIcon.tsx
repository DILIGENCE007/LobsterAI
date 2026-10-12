import React from 'react';

/** A person with glasses; distinct from the four shapes used for kits. */
const ExpertIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 20.5v-1.2c0-3 3.1-4.8 7-4.8s7 1.8 7 4.8v1.2M6.5 7V5.8A4.6 4.6 0 0 1 11.1 1.5h1.8a4.6 4.6 0 0 1 4.6 4.3V7M7 10.2a5.1 5.1 0 0 0 10 0M11 7.5h2" />
    <rect x="5.5" y="6.5" width="5.5" height="3.8" rx="1.6" />
    <rect x="13" y="6.5" width="5.5" height="3.8" rx="1.6" />
    <path d="m9 15 3 3 3-3M12 18v2.5" />
  </svg>
);

export default ExpertIcon;
