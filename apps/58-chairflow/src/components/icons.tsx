/**
 * src/components/icons.tsx
 *
 * The single icon set. 20x20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor` — DESIGN.md's list, drawn here rather than imported, so the set is
 * genuinely one hand's work and there is no emoji anywhere in the product.
 *
 * Nav renders at 22, inline at 18.
 */

import type { SVGProps } from "react";

export type IconName =
  | "chair-seat"
  | "day-grid"
  | "people-book"
  | "shield-card"
  | "policy-scroll"
  | "ledger-line"
  | "pulse-return"
  | "bell-slot"
  | "key-rent"
  | "link-bio"
  | "waive-hand"
  | "calendar-sync"
  | "download"
  | "chevron-right"
  | "chevron-left"
  | "plus"
  | "check"
  | "cross"
  | "clock"
  | "search"
  | "settings"
  | "mail"
  | "message"
  | "alert"
  | "user";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

const PATHS: Record<IconName, React.ReactNode> = {
  // The barber's chair, side on — the brand mark. Back, seat, pedestal.
  "chair-seat": (
    <>
      <path d="M5.5 11.5V4.6a1.8 1.8 0 0 1 3.6 0v6.9" />
      <path d="M5.5 11.5h8.3a1.7 1.7 0 0 1 0 3.4H7.2" />
      <path d="M8.6 14.9v1.9" />
      <path d="M5.4 17.4h6.4" />
    </>
  ),
  // The day: a column of time rows.
  "day-grid": (
    <>
      <path d="M3.2 4.6h13.6" />
      <path d="M3.2 10h13.6" />
      <path d="M3.2 15.4h13.6" />
      <path d="M6.4 2.8v3.6" />
      <path d="M13.6 8.2v3.6" />
    </>
  ),
  // The client book: two people over a bound edge.
  "people-book": (
    <>
      <circle cx="7.6" cy="6.4" r="2.3" />
      <path d="M3.4 13.2a4.3 4.3 0 0 1 8.4 0" />
      <path d="M13.4 5.2a2 2 0 0 1 0 3.9" />
      <path d="M14.2 13.2a3.6 3.6 0 0 0-1.6-2.6" />
      <path d="M3.4 16.6h13.2" />
    </>
  ),
  // Protection: a shield with a card stripe across it.
  "shield-card": (
    <>
      <path d="M10 2.6 4.4 4.7v4.6c0 3.4 2.3 6.3 5.6 7.6 3.3-1.3 5.6-4.2 5.6-7.6V4.7Z" />
      <path d="M5.1 8.8h9.8" />
      <path d="M7.4 11.7h2.4" />
    </>
  ),
  // The policy: a scroll with ruled lines.
  "policy-scroll": (
    <>
      <path d="M5 2.8h7.6a1.8 1.8 0 0 1 1.8 1.8v10.6a2.2 2.2 0 0 1-2.2 2.2H5.6a1.8 1.8 0 0 1-1.8-1.8V4.6A1.8 1.8 0 0 1 5.6 2.8Z" />
      <path d="M6.6 6.6h5.2" />
      <path d="M6.6 9.6h5.2" />
      <path d="M6.6 12.6h3.2" />
    </>
  ),
  // The ledger line: a receipt rule with a figure at its end.
  "ledger-line": (
    <>
      <path d="M3 6.4h9" />
      <path d="M3 10h6.4" />
      <path d="M3 13.6h9" />
      <path d="M15.4 4.6v10.8" />
      <path d="M13.6 6.8 15.4 4.6l1.8 2.2" />
    </>
  ),
  // The cadence nudge: a pulse that turns back.
  "pulse-return": (
    <>
      <path d="M2.8 10h3l1.8-4 2.4 8 1.8-4h2" />
      <path d="M14 7.6 16.4 10 14 12.4" />
    </>
  ),
  // The waitlist: a bell over an open slot.
  "bell-slot": (
    <>
      <path d="M6 8.6a4 4 0 0 1 8 0v3l1.2 2H4.8L6 11.6Z" />
      <path d="M8.6 16.2a1.6 1.6 0 0 0 2.8 0" />
      <path d="M10 2.6v1.9" />
    </>
  ),
  // Rent: a key over the chair's ledger.
  "key-rent": (
    <>
      <circle cx="6.6" cy="6.6" r="2.8" />
      <path d="M8.7 8.7l6 6" />
      <path d="M12.4 12.4l1.6-1.6" />
      <path d="M14.7 14.7l1.6-1.6" />
    </>
  ),
  // The booking page: a link in a bio.
  "link-bio": (
    <>
      <path d="M8.4 11.6a2.6 2.6 0 0 0 3.7 0l2.6-2.6a2.6 2.6 0 0 0-3.7-3.7l-.9.9" />
      <path d="M11.6 8.4a2.6 2.6 0 0 0-3.7 0L5.3 11a2.6 2.6 0 0 0 3.7 3.7l.9-.9" />
    </>
  ),
  // Waive: an open hand.
  "waive-hand": (
    <>
      <path d="M7 9.4V4.8a1.4 1.4 0 0 1 2.8 0v4" />
      <path d="M9.8 8.4V6.6a1.4 1.4 0 0 1 2.8 0v2.4" />
      <path d="M12.6 9.2a1.4 1.4 0 0 1 2.8 0v2.6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9.8a1.4 1.4 0 0 1 2.8 0" />
    </>
  ),
  "calendar-sync": (
    <>
      <path d="M4.2 5.2h11.6a1.4 1.4 0 0 1 1.4 1.4v8.2a1.4 1.4 0 0 1-1.4 1.4H4.2a1.4 1.4 0 0 1-1.4-1.4V6.6a1.4 1.4 0 0 1 1.4-1.4Z" />
      <path d="M6.6 3.2v3.4" />
      <path d="M13.4 3.2v3.4" />
      <path d="M7.4 12.2a2.8 2.8 0 0 1 4.8-1.6" />
      <path d="M12.2 8.8v1.8h-1.8" />
    </>
  ),
  download: (
    <>
      <path d="M10 3.4v8.8" />
      <path d="M6.6 9l3.4 3.4L13.4 9" />
      <path d="M3.8 15.8h12.4" />
    </>
  ),
  "chevron-right": <path d="M7.8 4.6 13 10l-5.2 5.4" />,
  "chevron-left": <path d="M12.2 4.6 7 10l5.2 5.4" />,
  plus: (
    <>
      <path d="M10 4.2v11.6" />
      <path d="M4.2 10h11.6" />
    </>
  ),
  check: <path d="M4.4 10.6 8 14.2 15.6 6" />,
  cross: (
    <>
      <path d="M5 5l10 10" />
      <path d="M15 5 5 15" />
    </>
  ),
  clock: (
    <>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 5.8V10l3 1.8" />
    </>
  ),
  search: (
    <>
      <circle cx="8.8" cy="8.8" r="5.4" />
      <path d="M12.8 12.8l4 4" />
    </>
  ),
  settings: (
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.6v2.2" />
      <path d="M10 15.2v2.2" />
      <path d="M3.6 10h2.2" />
      <path d="M14.2 10h2.2" />
      <path d="M5.5 5.5l1.6 1.6" />
      <path d="M12.9 12.9l1.6 1.6" />
      <path d="M14.5 5.5l-1.6 1.6" />
      <path d="M7.1 12.9l-1.6 1.6" />
    </>
  ),
  mail: (
    <>
      <path d="M3.4 5.4h13.2a1 1 0 0 1 1 1v7.2a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V6.4a1 1 0 0 1 1-1Z" />
      <path d="M2.8 6.4 10 11l7.2-4.6" />
    </>
  ),
  message: (
    <path d="M3.2 5.4a1.4 1.4 0 0 1 1.4-1.4h10.8a1.4 1.4 0 0 1 1.4 1.4v6.4a1.4 1.4 0 0 1-1.4 1.4H8.4l-3.8 3.2v-3.2a1.4 1.4 0 0 1-1.4-1.4Z" />
  ),
  alert: (
    <>
      <path d="M10 3.2 17.4 16H2.6Z" />
      <path d="M10 8v3.4" />
      <path d="M10 13.6v.1" />
    </>
  ),
  user: (
    <>
      <circle cx="10" cy="7" r="3" />
      <path d="M4.6 16.4a5.4 5.4 0 0 1 10.8 0" />
    </>
  ),
};

export function Icon({ name, size = 20, ...rest }: IconProps) {
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
