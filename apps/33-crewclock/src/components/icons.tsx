/**
 * The icon set. One family, 20x20 viewBox, 1.75 stroke, round caps and joins,
 * currentColor — per DESIGN.md. Nav renders at 22px, inline at 18px.
 *
 * No emoji anywhere, ever: a flagged punch is an amber map-pin and the words
 * "Outside fence", not a warning sign glyph.
 */

export interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

function svg(path: React.ReactNode, { size = 18, className, style }: IconProps) {
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
      className={className}
      style={style}
    >
      {path}
    </svg>
  );
}

/** Shift. */
export const IconClock = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.6V10l3.1 1.9" />
    </>,
    p,
  );

/** Job site. */
export const IconMapPin = (p: IconProps) =>
  svg(
    <>
      <path d="M10 17.5s5.5-4.6 5.5-8.5a5.5 5.5 0 0 0-11 0c0 3.9 5.5 8.5 5.5 8.5Z" />
      <circle cx="10" cy="9" r="1.9" />
    </>,
    p,
  );

/** The geofence itself — a circle with a mark at its centre. */
export const IconRing = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="7.2" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />
    </>,
    p,
  );

/** A crew member. */
export const IconHardHat = (p: IconProps) =>
  svg(
    <>
      <path d="M3.2 13.2a6.8 6.8 0 0 1 13.6 0" />
      <path d="M8 6.8V4.6h4v2.2" />
      <path d="M2.4 13.2h15.2" />
    </>,
    p,
  );

/** The crew. */
export const IconUsers = (p: IconProps) =>
  svg(
    <>
      <circle cx="7.6" cy="7.4" r="2.8" />
      <path d="M2.6 16.4a5 5 0 0 1 10 0" />
      <path d="M13.2 5.2a2.8 2.8 0 0 1 0 5.4M14.4 16.4a4.4 4.4 0 0 0-1.4-3.2" />
    </>,
    p,
  );

/** Jobs. */
export const IconHammer = (p: IconProps) =>
  svg(
    <>
      <path d="M11.6 3.4 8.4 6.6l1.4 1.4 3.2-3.2 2.1.7 1.3-1.3-3.5-2.1-1.3 1.3Z" />
      <path d="M8.9 8.7 3.6 14a1.6 1.6 0 0 0 2.3 2.3l5.3-5.3" />
    </>,
    p,
  );

/** Costs. */
export const IconGauge = (p: IconProps) =>
  svg(
    <>
      <path d="M3 14a7.6 7.6 0 1 1 14 0" />
      <path d="M10 14V9.4" />
      <path d="M3 14h2.2M14.8 14H17" />
    </>,
    p,
  );

export const IconBell = (p: IconProps) =>
  svg(
    <>
      <path d="M5.5 8.6a4.5 4.5 0 0 1 9 0c0 3 .8 4.4 1.5 5.2H4c.7-.8 1.5-2.2 1.5-5.2Z" />
      <path d="M8.2 16.2a2 2 0 0 0 3.6 0" />
    </>,
    p,
  );

export const IconDownload = (p: IconProps) =>
  svg(
    <>
      <path d="M10 3.2v8.6" />
      <path d="M6.4 8.6 10 12l3.6-3.4" />
      <path d="M4 15.4h12" />
    </>,
    p,
  );

export const IconCheck = (p: IconProps) => svg(<path d="M4 10.5 8 14.5 16 5.5" />, p);

export const IconPause = (p: IconProps) => svg(<path d="M7.5 4.6v10.8M12.5 4.6v10.8" />, p);

export const IconPlay = (p: IconProps) => svg(<path d="M6.8 4.4 15 10l-8.2 5.6V4.4Z" />, p);

export const IconChevronRight = (p: IconProps) => svg(<path d="M8 5l5 5-5 5" />, p);

export const IconGlobe = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M2.5 10h15M10 2.5c2 2.2 3 4.7 3 7.5s-1 5.3-3 7.5c-2-2.2-3-4.7-3-7.5s1-5.3 3-7.5Z" />
    </>,
    p,
  );

export const IconPlus = (p: IconProps) => svg(<path d="M10 4v12M4 10h12" />, p);

export const IconGear = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 1.9v2.1M10 16v2.1M3 6.1l1.8 1M15.2 12.9l1.8 1M3 13.9l1.8-1M15.2 7.1l1.8-1" />
    </>,
    p,
  );

export const IconMail = (p: IconProps) =>
  svg(
    <>
      <rect x="2.5" y="5" width="15" height="10" rx="1.6" />
      <path d="M3 6l7 5 7-5" />
    </>,
    p,
  );

export const IconAlertOff = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M5.2 5.2l9.6 9.6" />
    </>,
    p,
  );

/** The right glyph for a fence verdict, so lists stay legible at a glance. */
export function FenceIcon({
  status,
  size = 18,
}: {
  status: "inside" | "outside" | "unavailable" | null;
  size?: number;
}) {
  if (status === "inside") return <IconRing size={size} />;
  if (status === "outside") return <IconMapPin size={size} />;
  return <IconAlertOff size={size} />;
}
