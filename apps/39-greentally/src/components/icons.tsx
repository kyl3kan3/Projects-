/**
 * The icon set. One family, 20×20 viewBox, 1.75 stroke, round caps and joins,
 * currentColor — per DESIGN.md. Nav renders at 22px, inline at 18px.
 *
 * No emoji anywhere, ever, and no leaf glyphs: the brand mark is a tally stroke, not
 * foliage. An accepted document gets `check`; a document needing review gets
 * `magnifier`; provenance gets `thread` — a dot with a descending line.
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

/** Footprint — a gauge. */
export const IconGauge = (p: IconProps) =>
  svg(
    <>
      <path d="M3.2 14.5a8 8 0 1 1 13.6 0" />
      <path d="M10 11.2 13.4 7.6" />
      <circle cx="10" cy="12" r="1.1" />
    </>,
    p,
  );

/** Documents — a stack of files. */
export const IconFileStack = (p: IconProps) =>
  svg(
    <>
      <path d="M6.5 5.5V3.8a1 1 0 0 1 1-1h5.1l3.1 3.1v8.3a1 1 0 0 1-1 1h-1.2" />
      <path d="M3.5 7.2a1 1 0 0 1 1-1h5.1l3.1 3.1v7.3a1 1 0 0 1-1 1h-7.2a1 1 0 0 1-1-1z" />
    </>,
    p,
  );

/** Spend — a table. */
export const IconTable = (p: IconProps) =>
  svg(
    <>
      <rect x="2.8" y="3.8" width="14.4" height="12.4" rx="1" />
      <path d="M2.8 8h14.4M8 8v8.2M2.8 12.1h14.4" />
    </>,
    p,
  );

/** Report — a file with a check. */
export const IconFileCheck = (p: IconProps) =>
  svg(
    <>
      <path d="M4.5 3.8a1 1 0 0 1 1-1h5.6l3.9 3.9v9.5a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1z" />
      <path d="M7.3 11.4l1.9 1.9 3.5-3.9" />
    </>,
    p,
  );

/** Answers — a list of questions. */
export const IconQuestionList = (p: IconProps) =>
  svg(
    <>
      <path d="M7.6 5.2h9.6M7.6 10h9.6M7.6 14.8h6.4" />
      <path d="M3 5.2h1.4M3 10h1.4M3 14.8h1.4" />
    </>,
    p,
  );

export const IconUpload = (p: IconProps) =>
  svg(
    <>
      <path d="M10 13.2V3.6" />
      <path d="M6.4 7.2 10 3.6l3.6 3.6" />
      <path d="M3.4 12.6v2.8a1 1 0 0 0 1 1h11.2a1 1 0 0 0 1-1v-2.8" />
    </>,
    p,
  );

/** Scope 1 — a flame. */
export const IconFlame = (p: IconProps) =>
  svg(
    <>
      <path d="M10 2.6c2.4 3 4.6 4.7 4.6 8a4.6 4.6 0 0 1-9.2 0c0-1.7.9-3 2.2-4.4" />
      <path d="M10 17.2a2.2 2.2 0 0 0 1.4-3.8c-.8-.8-1.4-1.4-1.4-2.6-1 1-2.2 1.9-2.2 3.4A2.2 2.2 0 0 0 10 17.2z" />
    </>,
    p,
  );

/** Scope 2 — a bolt. */
export const IconBolt = (p: IconProps) =>
  svg(<path d="M11.4 2.4 5.2 11h3.8l-.8 6.6 6.4-8.8h-3.9z" />, p);

/** Scope 3 — a chain link. */
export const IconLinkChain = (p: IconProps) =>
  svg(
    <>
      <path d="M8.2 11.8 11.8 8.2" />
      <path d="M7.1 8.8 5.7 10.2a2.9 2.9 0 0 0 4.1 4.1l1.4-1.4" />
      <path d="M12.9 11.2l1.4-1.4a2.9 2.9 0 0 0-4.1-4.1L8.8 7.1" />
    </>,
    p,
  );

/** Needs review — a magnifier. */
export const IconMagnifier = (p: IconProps) =>
  svg(
    <>
      <circle cx="9" cy="9" r="4.8" />
      <path d="M12.6 12.6 17 17" />
    </>,
    p,
  );

export const IconCheck = (p: IconProps) => svg(<path d="M4.2 10.6 8 14.4l7.8-8.8" />, p);

/** Provenance — a dot with a descending line. The signature's glyph. */
export const IconThread = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="4.4" r="1.6" />
      <path d="M10 6.6v9.4" />
      <path d="M10 16h4.4" />
    </>,
    p,
  );

export const IconDownload = (p: IconProps) =>
  svg(
    <>
      <path d="M10 3.4v9.6" />
      <path d="M6.4 9.4 10 13l3.6-3.6" />
      <path d="M3.4 15.4v1a1 1 0 0 0 1 1h11.2a1 1 0 0 0 1-1v-1" />
    </>,
    p,
  );

export const IconPlus = (p: IconProps) => svg(<path d="M10 4.2v11.6M4.2 10h11.6" />, p);

export const IconChevronRight = (p: IconProps) => svg(<path d="M7.8 4.6 13.2 10l-5.4 5.4" />, p);

export const IconChevronLeft = (p: IconProps) => svg(<path d="M12.2 4.6 6.8 10l5.4 5.4" />, p);

export const IconClose = (p: IconProps) => svg(<path d="M5.2 5.2l9.6 9.6M14.8 5.2l-9.6 9.6" />, p);

/** Settings — sliders. A ring of radial ticks reads as a sunburst at 20px, not a gear. */
export const IconGear = (p: IconProps) =>
  svg(
    <>
      <path d="M3 6.4h4.2M11.4 6.4h5.6" />
      <path d="M3 13.6h8.6M15.8 13.6h1.2" />
      <circle cx="9.4" cy="6.4" r="2.1" />
      <circle cx="13.6" cy="13.6" r="2.1" />
    </>,
    p,
  );

/** Audit trail — a ledger with a rule. */
export const IconLedger = (p: IconProps) =>
  svg(
    <>
      <path d="M4.4 3.4h11.2a1 1 0 0 1 1 1v11.2a1 1 0 0 1-1 1H4.4a1 1 0 0 1-1-1V4.4a1 1 0 0 1 1-1z" />
      <path d="M6.6 3.4v13.2M9.2 7.6h5M9.2 10.4h5M9.2 13.2h3" />
    </>,
    p,
  );

export const IconLock = (p: IconProps) =>
  svg(
    <>
      <rect x="4.4" y="8.8" width="11.2" height="8" rx="1" />
      <path d="M7 8.8V6.6a3 3 0 0 1 6 0v2.2" />
    </>,
    p,
  );

export const IconCopy = (p: IconProps) =>
  svg(
    <>
      <rect x="7.2" y="7.2" width="9.6" height="9.6" rx="1" />
      <path d="M12.8 4.4V4.2a1 1 0 0 0-1-1H4.2a1 1 0 0 0-1 1v7.6a1 1 0 0 0 1 1h.2" />
    </>,
    p,
  );

/**
 * The brand mark: four tally strokes with the fifth struck across them. A count kept
 * by hand, which is what the product is — no leaf, no globe.
 */
export function TallyMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 4.6v10.8M8 4.6v10.8M11 4.6v10.8M14 4.6v10.8" />
      <path d="M3.6 14.2 15.4 5.8" />
    </svg>
  );
}
