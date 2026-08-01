/**
 * The icon set: one family, 20×20 viewBox, 1.75 stroke, round caps and joins,
 * currentColor — per DESIGN.md. Nav renders at 22px, inline at 18px.
 *
 * No emoji anywhere, ever. An award is a leaf-coloured check and a mono amount,
 * not a trophy.
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

/** Three vertical columns — the pipeline board. */
export const IconColumns = (p: IconProps) =>
  svg(
    <>
      <path d="M3.2 3.5h3.4v13H3.2zM8.3 3.5h3.4v13H8.3zM13.4 3.5h3.4v13h-3.4z" />
    </>,
    p,
  );

/** Compass — discovery. */
export const IconCompass = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="7.2" />
      <path d="m12.7 7.3-1.5 3.9-3.9 1.5 1.5-3.9z" />
    </>,
    p,
  );

/** Calendar with a tick — deadlines. */
export const IconCalendarTick = (p: IconProps) =>
  svg(
    <>
      <path d="M4 4.8h12a.9.9 0 0 1 .9.9v10a.9.9 0 0 1-.9.9H4a.9.9 0 0 1-.9-.9v-10a.9.9 0 0 1 .9-.9Z" />
      <path d="M6.8 2.7v3.2M13.2 2.7v3.2M3.1 8.6h13.8" />
      <path d="m7.6 12.4 1.7 1.7 3.2-3.4" />
    </>,
    p,
  );

/** Three book spines — the answer library. */
export const IconLibrary = (p: IconProps) =>
  svg(
    <>
      <path d="M3.4 3.6h2.7v12.8H3.4zM7.7 3.6h2.7v12.8H7.7z" />
      <path d="m12.3 4.4 2.6-.6 2 12.5-2.6.4z" />
    </>,
    p,
  );

/** A cog: toothed ring plus hub. Rays alone read as a sun, not as settings. */
export const IconGear = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M15.6 12.1a6.1 6.1 0 0 0 0-4.2l1.5-1-1.6-2.7-1.7.8a6.1 6.1 0 0 0-3.6-2.1L9.8 1.2H6.6l-.4 1.7a6.1 6.1 0 0 0-3.6 2.1l-1.7-.8-1.6 2.7 1.5 1a6.1 6.1 0 0 0 0 4.2l-1.5 1 1.6 2.7 1.7-.8a6.1 6.1 0 0 0 3.6 2.1l.4 1.7h3.2l.4-1.7a6.1 6.1 0 0 0 3.6-2.1l1.7.8 1.6-2.7Z" transform="translate(1.4 0.5) scale(0.86)" />
    </>,
    p,
  );

/** A gauge arc — fit. */
export const IconArcGauge = (p: IconProps) =>
  svg(
    <>
      <path d="M3.4 14.2a8 8 0 1 1 13.2 0" />
      <path d="m10 10.6 3.4-3.2" />
      <circle cx="10" cy="14.2" r="1.1" />
    </>,
    p,
  );

export const IconBell = (p: IconProps) =>
  svg(
    <>
      <path d="M6 8.4a4 4 0 0 1 8 0c0 3.1.8 4.4 1.5 5.1H4.5C5.2 12.8 6 11.5 6 8.4Z" />
      <path d="M8.4 16a1.8 1.8 0 0 0 3.2 0" />
    </>,
    p,
  );

/** A flag — a report is due. */
export const IconFlag = (p: IconProps) =>
  svg(
    <>
      <path d="M5.2 17V3.4" />
      <path d="M5.2 4.1h9.3l-1.9 3.6 1.9 3.6H5.2z" />
    </>,
    p,
  );

export const IconCheck = (p: IconProps) =>
  svg(<path d="m4.2 10.6 3.6 3.6 8-8.4" />, p);

export const IconX = (p: IconProps) =>
  svg(<path d="M5.4 5.4l9.2 9.2M14.6 5.4l-9.2 9.2" />, p);

export const IconDash = (p: IconProps) => svg(<path d="M5 10h10" />, p);

/** Two overlapping sheets — use this answer. */
export const IconCopy = (p: IconProps) =>
  svg(
    <>
      <path d="M7.4 7.4h8.2a.9.9 0 0 1 .9.9v8.2a.9.9 0 0 1-.9.9H7.4a.9.9 0 0 1-.9-.9V8.3a.9.9 0 0 1 .9-.9Z" />
      <path d="M13.1 4.9V3.6a.9.9 0 0 0-.9-.9H4a.9.9 0 0 0-.9.9v8.2a.9.9 0 0 0 .9.9h1.3" />
    </>,
    p,
  );

export const IconDownload = (p: IconProps) =>
  svg(
    <>
      <path d="M10 3.2v9.1" />
      <path d="m6.3 8.8 3.7 3.6 3.7-3.6" />
      <path d="M3.6 16.4h12.8" />
    </>,
    p,
  );

export const IconPlus = (p: IconProps) => svg(<path d="M10 4.4v11.2M4.4 10h11.2" />, p);

export const IconChevronRight = (p: IconProps) => svg(<path d="m7.8 4.6 6 5.4-6 5.4" />, p);

export const IconChevronDown = (p: IconProps) => svg(<path d="m4.6 7.8 5.4 6 5.4-6" />, p);

export const IconChevronLeft = (p: IconProps) => svg(<path d="m12.2 4.6-6 5.4 6 5.4" />, p);

/** Circular arrows — data freshness, token rotation. */
export const IconRefresh = (p: IconProps) =>
  svg(
    <>
      <path d="M16.3 9.1a6.4 6.4 0 0 0-11-3.3L3.6 7.5" />
      <path d="M3.6 4.2v3.3h3.3" />
      <path d="M3.7 10.9a6.4 6.4 0 0 0 11 3.3l1.7-1.7" />
      <path d="M16.4 15.8v-3.3h-3.3" />
    </>,
    p,
  );

export const IconExternal = (p: IconProps) =>
  svg(
    <>
      <path d="M11.4 3.6h5v5" />
      <path d="M16.4 3.6 9.6 10.4" />
      <path d="M14 11.6v4.1a.9.9 0 0 1-.9.9H4.3a.9.9 0 0 1-.9-.9V6.9a.9.9 0 0 1 .9-.9h4.1" />
    </>,
    p,
  );

export const IconMail = (p: IconProps) =>
  svg(
    <>
      <path d="M3.4 5.2h13.2a.9.9 0 0 1 .9.9v7.8a.9.9 0 0 1-.9.9H3.4a.9.9 0 0 1-.9-.9V6.1a.9.9 0 0 1 .9-.9Z" />
      <path d="m2.9 6 7.1 4.8L17.1 6" />
    </>,
    p,
  );

export const IconTrash = (p: IconProps) =>
  svg(
    <>
      <path d="M3.6 5.9h12.8" />
      <path d="M7.7 5.9V3.8h4.6v2.1" />
      <path d="M5.4 5.9l.7 10a.9.9 0 0 0 .9.8h6a.9.9 0 0 0 .9-.8l.7-10" />
    </>,
    p,
  );

export const IconEdit = (p: IconProps) =>
  svg(
    <>
      <path d="M13.4 3.6l3 3-8.6 8.6-3.6.6.6-3.6z" />
      <path d="M11.6 5.4l3 3" />
    </>,
    p,
  );

export const IconSearch = (p: IconProps) =>
  svg(
    <>
      <circle cx="9.1" cy="9.1" r="5.5" />
      <path d="m13.2 13.2 3.2 3.2" />
    </>,
    p,
  );

export const IconBuilding = (p: IconProps) =>
  svg(
    <>
      <path d="M4.4 17V4.4a.9.9 0 0 1 .9-.9h6.1a.9.9 0 0 1 .9.9V17" />
      <path d="M12.3 8.2h2.4a.9.9 0 0 1 .9.9V17" />
      <path d="M3.2 17h13.6M7 6.6h2.4M7 9.6h2.4M7 12.6h2.4" />
    </>,
    p,
  );
