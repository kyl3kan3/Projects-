/**
 * The icon set. One family, 20×20 viewBox, 1.75 stroke, round caps and joins,
 * currentColor — per DESIGN.md. Nav renders at 22px, inline at 18px, kiosk 26px.
 *
 * No emoji anywhere, ever: coverage is a shield glyph and a pine dot, never a
 * green check mark.
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

/** The brand mark and the check-in glyph: two stacked chevrons, painting up. */
export const IconBlaze = (p: IconProps) =>
  svg(
    <>
      <path d="M4.5 11.5 10 6l5.5 5.5" />
      <path d="M4.5 16 10 10.5 15.5 16" />
    </>,
    p,
  );

export const IconPeople = (p: IconProps) =>
  svg(
    <>
      <circle cx="7.6" cy="7" r="2.6" />
      <path d="M2.6 16.5c0-2.5 2.2-4.2 5-4.2s5 1.7 5 4.2" />
      <path d="M13.4 5.1a2.6 2.6 0 0 1 0 4.9M14.6 12.6c1.8.5 3 1.9 3 3.9" />
    </>,
    p,
  );

export const IconDocumentPen = (p: IconProps) =>
  svg(
    <>
      <path d="M11.5 2.5H5.6A1.6 1.6 0 0 0 4 4.1v11.8a1.6 1.6 0 0 0 1.6 1.6H10" />
      <path d="M11.5 2.5 15.5 6.5v2" />
      <path d="M12.6 17.5H16v-3.4l-1.7-1.7-3.4 3.4v1.7Z" />
      <path d="M7 7.5h4M7 10.5h3" />
    </>,
    p,
  );

export const IconFlag = (p: IconProps) =>
  svg(
    <>
      <path d="M5 2.8v14.4" />
      <path d="M5 3.6h8.6l-1.4 3.2 1.4 3.2H5" />
    </>,
    p,
  );

export const IconGear = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 1.8v2M10 16.2v2M2.6 6l1.7 1M15.7 13l1.7 1M2.6 14l1.7-1M15.7 7l1.7-1" />
    </>,
    p,
  );

export const IconQr = (p: IconProps) =>
  svg(
    <>
      <path d="M3 6.4V3.6a.6.6 0 0 1 .6-.6h2.8M13.6 3h2.8a.6.6 0 0 1 .6.6v2.8M17 13.6v2.8a.6.6 0 0 1-.6.6h-2.8M6.4 17H3.6a.6.6 0 0 1-.6-.6v-2.8" />
      <path d="M6.6 6.6h2.2v2.2H6.6zM11.2 11.2h2.2v2.2h-2.2z" />
      <path d="M11.2 6.6h2.2M6.6 11.2v2.2" />
    </>,
    p,
  );

export const IconSearch = (p: IconProps) =>
  svg(
    <>
      <circle cx="8.8" cy="8.8" r="5.3" />
      <path d="M12.8 12.8 17 17" />
    </>,
    p,
  );

/** Covered. */
export const IconShieldCheck = (p: IconProps) =>
  svg(
    <>
      <path d="M10 2.6 4.4 4.8v4.6c0 3.4 2.3 6.4 5.6 8 3.3-1.6 5.6-4.6 5.6-8V4.8L10 2.6Z" />
      <path d="M7.4 9.8 9.3 11.7l3.4-3.6" />
    </>,
    p,
  );

/** Expired or missing. */
export const IconShieldSlash = (p: IconProps) =>
  svg(
    <>
      <path d="M10 2.6 4.4 4.8v4.6c0 3.4 2.3 6.4 5.6 8 3.3-1.6 5.6-4.6 5.6-8V4.8L10 2.6Z" />
      <path d="M6.8 13.2 13.2 6.8" />
    </>,
    p,
  );

/** The guardian tie. */
export const IconLink = (p: IconProps) =>
  svg(
    <>
      <path d="M8.4 11.6 11.6 8.4" />
      <path d="M7.2 8.2 5.4 10a2.9 2.9 0 0 0 4.1 4.1l1.3-1.3" />
      <path d="M12.8 11.8 14.6 10a2.9 2.9 0 0 0-4.1-4.1L9.2 7.2" />
    </>,
    p,
  );

export const IconDownload = (p: IconProps) =>
  svg(
    <>
      <path d="M10 3v9M6.4 8.6 10 12.2l3.6-3.6" />
      <path d="M3.6 15.4h12.8" />
    </>,
    p,
  );

export const IconRefresh = (p: IconProps) =>
  svg(
    <>
      <path d="M17 10a7 7 0 1 1-2.1-5" />
      <path d="M17 3.5V8h-4.5" />
    </>,
    p,
  );

export const IconCheck = (p: IconProps) => svg(<path d="M4 10.5l4 4 8-9" />, p);

export const IconPlus = (p: IconProps) => svg(<path d="M10 4v12M4 10h12" />, p);

export const IconChevronRight = (p: IconProps) => svg(<path d="M8 5l5 5-5 5" />, p);

export const IconChevronLeft = (p: IconProps) => svg(<path d="M12 5 7 10l5 5" />, p);

export const IconWifiOff = (p: IconProps) =>
  svg(
    <>
      <path d="M3 4l14 12" />
      <path d="M6.2 9.4a6.6 6.6 0 0 1 3-1.3M2.8 6.6a10.4 10.4 0 0 1 4-2.3M13.4 8.4a6.6 6.6 0 0 1 1.8 1.4M12.2 4.5a10.4 10.4 0 0 1 4 2.1" />
      <path d="M8 12.6a3 3 0 0 1 4 0" />
      <circle cx="10" cy="16" r="0.9" fill="currentColor" stroke="none" />
    </>,
    p,
  );

export const IconTrash = (p: IconProps) =>
  svg(
    <>
      <path d="M4 6.5h12M8 6.5V4.8h4v1.7" />
      <path d="M5.5 6.5l.7 9.3h7.6l.7-9.3" />
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

export const IconClock = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="7.4" />
      <path d="M10 5.8V10l3 1.8" />
    </>,
    p,
  );

/** The glyph for a coverage state — never a colour on its own. */
export function CoverageIcon({
  coverage,
  size = 18,
}: {
  coverage: "on_file" | "visitor" | "expired" | "none";
  size?: number;
}) {
  if (coverage === "on_file" || coverage === "visitor") return <IconShieldCheck size={size} />;
  return <IconShieldSlash size={size} />;
}
