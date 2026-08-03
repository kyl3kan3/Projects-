/**
 * The icon set. One family, 20×20 viewBox, 1.75 stroke, round caps and joins,
 * currentColor — per DESIGN.md. Nav renders at 22px, inline at 18px.
 *
 * No emoji anywhere, ever: a confirmed entry gets the `rule-off` glyph — a short
 * horizontal stroke with a check — not a green tick emoji.
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

/** Inbox — a tray with paper entering it. */
export const IconInboxTray = (p: IconProps) =>
  svg(
    <>
      <path d="M2.5 12.5h4l1.2 2h4.6l1.2-2h4" />
      <path d="M2.5 12.5 5 4.5h10l2.5 8v4a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />
    </>,
    p,
  );

/** Capture — a camera. */
export const IconCamera = (p: IconProps) =>
  svg(
    <>
      <path d="M2.5 7.5a1 1 0 0 1 1-1h2.2l1.1-1.8h6.4l1.1 1.8h2.2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />
      <circle cx="10" cy="11" r="2.8" />
    </>,
    p,
  );

/** Needs review — a small flag. */
export const IconFlagSmall = (p: IconProps) =>
  svg(
    <>
      <path d="M5.5 2.8v14.4" />
      <path d="M5.5 3.6h8.7l-1.7 3.4 1.7 3.4H5.5z" />
    </>,
    p,
  );

/** Close package — a closed book. */
export const IconBookClosed = (p: IconProps) =>
  svg(
    <>
      <path d="M4.5 3.5h9.8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4.5z" />
      <path d="M4.5 3.5a1.4 1.4 0 0 0 0 2.8h1.6M6.1 3.5v13" />
    </>,
    p,
  );

export const IconGear = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2.2v2.3M10 15.5v2.3M2.2 10h2.3M15.5 10h2.3M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M15.3 4.7l-1.6 1.6M4.7 15.3l1.6-1.6" />
    </>,
    p,
  );

/** Forwarded by email — an envelope with an inbound arrow. */
export const IconMailIn = (p: IconProps) =>
  svg(
    <>
      <path d="M17.5 8.2V15a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6.4" />
      <path d="M2.9 6.2 10 11l2.4-1.6" />
      <path d="M14.2 2.5v5.2M11.9 5.5l2.3 2.2 2.3-2.2" />
    </>,
    p,
  );

export const IconCheck = (p: IconProps) => svg(<path d="M4 10.5l4 4 8-9" />, p);

/** The confirm action — a short rule with a check above it. */
export const IconRuleOff = (p: IconProps) =>
  svg(
    <>
      <path d="M3.5 15.5h13" />
      <path d="M5.5 8.8 8.6 12l5.9-6.6" />
    </>,
    p,
  );

export const IconPencil = (p: IconProps) =>
  svg(
    <>
      <path d="M14.1 3.4l2.5 2.5-9.3 9.3-3.4.9.9-3.4z" />
      <path d="M12.4 5.1l2.5 2.5" />
    </>,
    p,
  );

/** Duplicate — two overlapping sheets. */
export const IconCopyTwo = (p: IconProps) =>
  svg(
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.6" />
      <path d="M13 4.5a1.6 1.6 0 0 0-1.6-1.6H4.6A1.6 1.6 0 0 0 3 4.5v6.8a1.6 1.6 0 0 0 1.6 1.6" />
    </>,
    p,
  );

export const IconDownload = (p: IconProps) =>
  svg(
    <>
      <path d="M10 3v9" />
      <path d="M6.2 8.5 10 12.3l3.8-3.8" />
      <path d="M3.5 15.5h13" />
    </>,
    p,
  );

export const IconLink = (p: IconProps) =>
  svg(
    <>
      <path d="M8.4 11.6a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1" />
      <path d="M11.6 8.4a3 3 0 0 0-4.2 0L4.8 11a3 3 0 0 0 4.2 4.2l1-1" />
    </>,
    p,
  );

export const IconChevronRight = (p: IconProps) => svg(<path d="M8 5l5 5-5 5" />, p);

export const IconPlus = (p: IconProps) => svg(<path d="M10 4v12M4 10h12" />, p);

export const IconClose = (p: IconProps) => svg(<path d="M5 5l10 10M15 5 5 15" />, p);

/** A stand-in for a stored original whose thumbnail is not an image. */
export const IconDocument = (p: IconProps) =>
  svg(
    <>
      <path d="M5 2.8h6l4 4v10.4H5z" />
      <path d="M11 2.8v4h4" />
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

export const IconCopy = (p: IconProps) =>
  svg(
    <>
      <rect x="7.5" y="7.5" width="9" height="9" rx="1.6" />
      <path d="M12.5 5.2a1.7 1.7 0 0 0-1.7-1.7H5.2a1.7 1.7 0 0 0-1.7 1.7v5.6a1.7 1.7 0 0 0 1.7 1.7" />
    </>,
    p,
  );

export const IconArrowLeft = (p: IconProps) => svg(<path d="M16 10H4M8.5 5.5 4 10l4.5 4.5" />, p);

export const IconArrowRight = (p: IconProps) => svg(<path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5" />, p);
