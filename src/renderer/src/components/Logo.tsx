import type { SVGProps } from 'react';

// FCC Studio mark — terminal-prompt chevron with a spark in the notch.
// Mirrored in src/main/splash.ts (LOGO_SVG) and resources/icon.svg.
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
      <path d="M10 10L54 32L10 54L10 42L30 32L10 22Z" />
      <path d="M16.5 25L18.5 28.5L22 30.5L18.5 32.5L16.5 36L14.5 32.5L11 30.5L14.5 28.5Z" />
    </svg>
  );
}
