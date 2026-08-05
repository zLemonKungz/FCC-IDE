import type { SVGProps } from 'react';

// FCC Studio mark — a solid rounded "F" (three bars + terminal cursor block).
// Mirrored in src/main/splash.ts (LOGO_SVG, gradient) and resources/icon.svg.
export default function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 64 64"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <rect x="20" y="13.5" width="9" height="34.5" rx="4.5" fill="currentColor" />
      <rect x="20" y="13.5" width="29.5" height="8.5" rx="4.25" fill="currentColor" />
      <rect x="20" y="26.5" width="18" height="8.5" rx="4.25" fill="currentColor" />
      <rect x="51.5" y="14.5" width="3" height="7.5" rx="1.5" fill="currentColor" />
    </svg>
  );
}