/**
 * The icon set. One family, 20×20 viewBox, 1.75 stroke, round caps and joins,
 * currentColor — exactly the glyph list DESIGN.md requires. Nav renders at 22px,
 * inline at 16px.
 *
 * No emoji anywhere, ever. An emotion tag is the word REVENGE in a hairline
 * chip, not a face.
 */

export interface IconProps {
  size?: number;
  className?: string;
}

function svg(path: React.ReactNode, { size = 16, className }: IconProps) {
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
    >
      {path}
    </svg>
  );
}

/** Dashboard — the equity line. */
export const IconCurve = (p: IconProps) =>
  svg(<path d="M2 15.5 6.8 9.2l3 2.6L18 4.5" />, p);

/** Journal — a ruled page. */
export const IconJournal = (p: IconProps) =>
  svg(
    <>
      <path d="M4.5 2.5h11v15h-11z" />
      <path d="M7.5 6.5h5M7.5 10h5M7.5 13.5h3" />
    </>,
    p,
  );

/** Insights — a droplet: the leak. */
export const IconLeak = (p: IconProps) =>
  svg(<path d="M10 2.5c2.6 3.1 5 5.6 5 8.4a5 5 0 0 1-10 0c0-2.8 2.4-5.3 5-8.4Z" />, p);

/** Import — a tray with an arrow into it. */
export const IconImport = (p: IconProps) =>
  svg(
    <>
      <path d="M10 2.5v8.5" />
      <path d="M6.75 8l3.25 3 3.25-3" />
      <path d="M3 13v3.5h14V13" />
    </>,
    p,
  );

export const IconCalendar = (p: IconProps) =>
  svg(
    <>
      <path d="M3.5 5h13v12h-13z" />
      <path d="M3.5 8.5h13M7 3v3M13 3v3" />
    </>,
    p,
  );

/** Setup tag. */
export const IconTag = (p: IconProps) =>
  svg(
    <>
      <path d="M10.4 2.6H17v6.6l-7.8 7.8a1.4 1.4 0 0 1-2 0l-4.6-4.6a1.4 1.4 0 0 1 0-2Z" />
      <path d="M13.6 6.2h.01" />
    </>,
    p,
  );

export const IconFilter = (p: IconProps) =>
  svg(<path d="M3 5h14M6 10h8M8.5 15h3" />, p);

export const IconChevronDown = (p: IconProps) => svg(<path d="M5 7.5 10 12.5l5-5" />, p);
export const IconChevronRight = (p: IconProps) => svg(<path d="M7.5 4.5 12.5 10l-5 5.5" />, p);
export const IconCheck = (p: IconProps) => svg(<path d="M4 10.5 8 14.5l8-9" />, p);
export const IconClose = (p: IconProps) => svg(<path d="M5 5l10 10M15 5 5 15" />, p);

/** Alert — a triangle. */
export const IconAlert = (p: IconProps) =>
  svg(
    <>
      <path d="M10 3 18 16.5H2Z" />
      <path d="M10 8v4M10 14.5h.01" />
    </>,
    p,
  );

/** Chart snapshot. */
export const IconCamera = (p: IconProps) =>
  svg(
    <>
      <path d="M2.5 6.5h3l1.5-2h6l1.5 2h3v10h-15Z" />
      <circle cx="10" cy="11" r="3" />
    </>,
    p,
  );

/** Watch this pattern. */
export const IconEye = (p: IconProps) =>
  svg(
    <>
      <path d="M1.5 10S4.6 4.5 10 4.5 18.5 10 18.5 10 15.4 15.5 10 15.5 1.5 10 1.5 10Z" />
      <circle cx="10" cy="10" r="2.4" />
    </>,
    p,
  );

export const IconTrash = (p: IconProps) =>
  svg(
    <>
      <path d="M3.5 5.5h13" />
      <path d="M5.5 5.5 6.4 17h7.2l.9-11.5" />
      <path d="M8 5.5V3h4v2.5" />
    </>,
    p,
  );

export const IconPlus = (p: IconProps) => svg(<path d="M10 4v12M4 10h12" />, p);
export const IconArrowRight = (p: IconProps) =>
  svg(
    <>
      <path d="M3.5 10h13" />
      <path d="M12 5.5 16.5 10 12 14.5" />
    </>,
    p,
  );
export const IconGear = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
    </>,
    p,
  );
