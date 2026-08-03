/**
 * src/components/icons.tsx
 *
 * The single icon set. 20x20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor` — DESIGN.md's list, drawn rather than imported, so the set is
 * genuinely consistent and there is no emoji anywhere in the product.
 *
 * Nav renders at 22, inline at 18.
 */

import type { SVGProps } from "react";

export type IconName =
  | "chair-side"
  | "list-rows"
  | "send-steps"
  | "phone-handset"
  | "ledger-book"
  | "arrow-up-doc"
  | "calendar-slot"
  | "link-token"
  | "shield-line"
  | "pause-octagon"
  | "check-seat"
  | "download"
  | "chevron-right"
  | "plus"
  | "mail"
  | "message"
  | "settings"
  | "alert"
  | "clock"
  | "user";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

const PATHS: Record<IconName, React.ReactNode> = {
  // The hygiene chair — the brand mark. Back, seat, base.
  "chair-side": (
    <>
      <path d="M5.5 12.5V5.2a1.7 1.7 0 0 1 3.4 0v7.3" />
      <path d="M5.5 12.5h8.2a1.6 1.6 0 0 1 0 3.2H7.1" />
      <path d="M8.4 15.7v1.8" />
      <path d="M4 17.5h6" />
    </>
  ),
  "list-rows": (
    <>
      <path d="M3 5.5h14" />
      <path d="M3 10h14" />
      <path d="M3 14.5h9" />
    </>
  ),
  // Sequence: three nodes on a line, the last one open.
  "send-steps": (
    <>
      <path d="M4 4.5v11" />
      <circle cx="4" cy="4.5" r="1.4" />
      <circle cx="4" cy="10" r="1.4" />
      <circle cx="4" cy="15.5" r="1.4" />
      <path d="M7.5 4.5h8.5" />
      <path d="M7.5 10h6" />
      <path d="M7.5 15.5h4" />
    </>
  ),
  "phone-handset": (
    <path d="M6.3 3.5 4.2 5.6c-.5.5-.6 1.3-.2 1.9a19 19 0 0 0 8.5 8.5c.6.4 1.4.3 1.9-.2l2.1-2.1-3.2-2.3-1.7 1.2a13 13 0 0 1-4.2-4.2l1.2-1.7-2.3-3.2Z" />
  ),
  "ledger-book": (
    <>
      <path d="M4 4.2h9.3a2 2 0 0 1 2 2v9.6H6a2 2 0 0 1-2-2V4.2Z" />
      <path d="M4 13.8h11.3" />
      <path d="M7.5 7.4h4.5" />
      <path d="M7.5 10.2h3" />
    </>
  ),
  "arrow-up-doc": (
    <>
      <path d="M11.5 2.8H6a1.7 1.7 0 0 0-1.7 1.7v11a1.7 1.7 0 0 0 1.7 1.7h8a1.7 1.7 0 0 0 1.7-1.7V7l-4.2-4.2Z" />
      <path d="M11.3 2.9V7h4.2" />
      <path d="M10 14v-4.4" />
      <path d="M8.3 11.2 10 9.5l1.7 1.7" />
    </>
  ),
  "calendar-slot": (
    <>
      <rect x="3.2" y="4.6" width="13.6" height="12.2" rx="1.8" />
      <path d="M3.2 8.4h13.6" />
      <path d="M7 3.2v2.6" />
      <path d="M13 3.2v2.6" />
      <path d="M7.4 12h2.2" />
    </>
  ),
  "link-token": (
    <>
      <path d="M8.4 11.6 11.6 8.4" />
      <path d="M7.2 8.6 6 9.8a2.6 2.6 0 0 0 3.7 3.7l1.2-1.2" />
      <path d="M12.8 11.4 14 10.2a2.6 2.6 0 0 0-3.7-3.7L9.1 7.7" />
    </>
  ),
  "shield-line": (
    <>
      <path d="M10 2.8 4.6 5v4.4c0 3.3 2.2 6.3 5.4 7.8 3.2-1.5 5.4-4.5 5.4-7.8V5L10 2.8Z" />
      <path d="M7.8 9.9l1.6 1.6 3-3.2" />
    </>
  ),
  "pause-octagon": (
    <>
      <path d="M7.1 2.9h5.8l4.2 4.2v5.8l-4.2 4.2H7.1L2.9 12.9V7.1L7.1 2.9Z" />
      <path d="M8.5 7.6v4.8" />
      <path d="M11.5 7.6v4.8" />
    </>
  ),
  "check-seat": (
    <>
      <path d="M3.4 10.6l3 3 6.4-7.2" />
      <path d="M11.6 13.2l1.4 1.4 3.6-4" />
    </>
  ),
  download: (
    <>
      <path d="M10 3.4v8.4" />
      <path d="M6.6 8.6 10 12l3.4-3.4" />
      <path d="M4 15.6h12" />
    </>
  ),
  "chevron-right": <path d="M8 5l5 5-5 5" />,
  plus: (
    <>
      <path d="M10 4.4v11.2" />
      <path d="M4.4 10h11.2" />
    </>
  ),
  mail: (
    <>
      <rect x="2.8" y="5" width="14.4" height="10" rx="1.7" />
      <path d="M3.4 6.1 10 10.8l6.6-4.7" />
    </>
  ),
  message: (
    <path d="M17 9.4c0 3.1-3.1 5.6-7 5.6-.9 0-1.7-.1-2.5-.4L4 16l.9-2.6A5.3 5.3 0 0 1 3 9.4C3 6.4 6.1 3.9 10 3.9s7 2.5 7 5.5Z" />
  ),
  settings: (
    <>
      <circle cx="10" cy="10" r="2.4" />
      <path d="M10 2.8v2M10 15.2v2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M2.8 10h2M15.2 10h2M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4" />
    </>
  ),
  alert: (
    <>
      <path d="M10 3.6 2.9 16h14.2L10 3.6Z" />
      <path d="M10 8v3.4" />
      <path d="M10 13.6h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="10" cy="10" r="7.1" />
      <path d="M10 5.8V10l3 1.8" />
    </>
  ),
  user: (
    <>
      <circle cx="10" cy="7.2" r="3.1" />
      <path d="M4.4 16.6c.7-2.7 2.9-4.3 5.6-4.3s4.9 1.6 5.6 4.3" />
    </>
  ),
};

export function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
