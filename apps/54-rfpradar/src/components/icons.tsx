/**
 * The icon set: one family, 20×20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor`. Nav renders at 22px, inline at 18px (DESIGN.md).
 *
 * No emoji anywhere in the product — a won pursuit gets `flag-small` in green,
 * not a trophy. That is a build rule, not a preference.
 *
 * These are server-safe: pure SVG, no hooks, no client boundary.
 */

import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** The brand mark: a quarter sweep with a blip. */
export function RadarArc(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 17.5a15 15 0 0 1 15-15" />
      <path d="M7 17.5a10.5 10.5 0 0 1 10.5-10.5" />
      <path d="M11.5 17.5A6 6 0 0 1 17.5 11.5" />
      <circle cx="7.75" cy="8.25" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Opportunities / notices. */
export function DocSeal(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11.5 2.5H5.5A1.5 1.5 0 0 0 4 4v12a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 16 16V7z" />
      <path d="M11.5 2.5V7H16" />
      <circle cx="10" cy="12.25" r="2.25" />
    </Svg>
  );
}

/** Go/no-go. */
export function ScaleBalance(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3v13" />
      <path d="M5.5 16.5h9" />
      <path d="M3 7h14" />
      <path d="M3 7l-1.5 4a3 3 0 0 0 6 0z" />
      <path d="M17 7l1.5 4a3 3 0 0 1-6 0z" />
    </Svg>
  );
}

/** Deadlines. */
export function CalendarTick(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.75" y="4.25" width="14.5" height="13" rx="1.5" />
      <path d="M2.75 8.25h14.5" />
      <path d="M6.75 2.5v3M13.25 2.5v3" />
      <path d="M7.25 12.5l2 2 3.5-3.75" />
    </Svg>
  );
}

/** The answer library. */
export function BooksRow(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="4" width="4" height="13" rx="1" />
      <rect x="8" y="4" width="4" height="13" rx="1" />
      <path d="M14.25 5.25l3 .75-2.5 10.5-3-.75z" />
    </Svg>
  );
}

/** Keyword profiles. */
export function TargetRing(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="7.25" />
      <circle cx="10" cy="10" r="3.5" />
      <circle cx="10" cy="10" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function SlackHash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7.5 3v14M12.5 3v14" />
      <path d="M3 7.5h14M3 12.5h14" />
    </Svg>
  );
}

export function MailFlat(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="4.75" width="15" height="10.5" rx="1.5" />
      <path d="M3 5.5l7 5 7-5" />
    </Svg>
  );
}

export function LinkOut(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 3h6v6" />
      <path d="M17 3l-7.5 7.5" />
      <path d="M14.5 12v3.5A1.5 1.5 0 0 1 13 17H4.5A1.5 1.5 0 0 1 3 15.5V7a1.5 1.5 0 0 1 1.5-1.5H8" />
    </Svg>
  );
}

export function FlagSmall(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 17V3" />
      <path d="M5 3.75h8.5l-1.5 3 1.5 3H5z" />
    </Svg>
  );
}

export function Download(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3v9" />
      <path d="M6.25 8.5L10 12.25l3.75-3.75" />
      <path d="M3.5 15.5h13" />
    </Svg>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7.5 4.5l6 5.5-6 5.5" />
    </Svg>
  );
}

export function ChevronLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12.5 4.5l-6 5.5 6 5.5" />
    </Svg>
  );
}

export function Plus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4v12M4 10h12" />
    </Svg>
  );
}

export function Gear(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="2.75" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9L4.7 15.3" />
    </Svg>
  );
}

/** A matched factor. */
export function Check(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10.5l4 4 8-9" />
    </Svg>
  );
}

/** An unmatched factor. */
export function Cross(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
    </Svg>
  );
}

export function Search(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8.75" cy="8.75" r="5.25" />
      <path d="M12.75 12.75L17 17" />
    </Svg>
  );
}

export function Clock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 6v4.25l3 1.75" />
    </Svg>
  );
}

export function Users(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7.75" cy="7" r="2.75" />
      <path d="M2.75 16.5a5 5 0 0 1 10 0" />
      <path d="M13.5 5.1a2.75 2.75 0 0 1 0 5.3" />
      <path d="M14.5 12.5a5 5 0 0 1 2.75 4" />
    </Svg>
  );
}

export function Card(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="4.75" width="15" height="10.5" rx="1.5" />
      <path d="M2.5 8.5h15" />
      <path d="M5.5 12.25h3" />
    </Svg>
  );
}

export function BarsReport(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 16.5h14" />
      <path d="M6 16.5V9M10 16.5V4.5M14 16.5v-4.5" />
    </Svg>
  );
}
