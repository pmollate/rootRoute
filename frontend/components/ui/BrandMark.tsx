import { useId } from 'react';

/**
 * The Root Route mark (public/brand/root-route-mark.svg) inlined so its ink follows
 * `currentColor` and flips with the theme; the orange accents stay fixed.
 */
export function BrandMark({ className }: { className?: string }) {
  const mask = `rr-${useId().replace(/:/g, '')}`;
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect width="64" height="64" fill="#fff" />
          <circle cx="21" cy="50" r="8" />
          <circle cx="46" cy="50" r="8" />
          <rect x="16.5" y="27" width="7" height="7" rx="1.2" />
        </mask>
      </defs>
      <g fill="currentColor">
        <path
          mask={`url(#${mask})`}
          fillRule="evenodd"
          d="M13 12H36C45.5 12 50.5 17.5 50.5 24.5C50.5 30.5 47 34.5 41.5 35.8L54 48H42L30.6 36.8H27V48H13Z M27 19.5H35.5C38.6 19.5 40.5 21.6 40.5 24.4C40.5 27.2 38.6 29.4 35.5 29.4H27Z"
        />
        <circle cx="21" cy="50" r="5" />
        <circle cx="46" cy="50" r="5" />
      </g>
      <rect x="17.5" y="28" width="5" height="5" rx="0.8" fill="#ff5a1f" />
      <g strokeLinecap="round" strokeWidth="4">
        <path d="M1.5 17H8" stroke="#ff5a1f" />
        <path d="M4 26H8" stroke="currentColor" />
        <path d="M1.5 35H8" stroke="currentColor" />
      </g>
    </svg>
  );
}
