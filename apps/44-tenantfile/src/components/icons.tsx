/**
 * The icon set. One family: 20×20 viewBox, 1.75 stroke, round caps and joins,
 * currentColor — per DESIGN.md. Nav renders at 22px, inline at 18px.
 *
 * No emoji anywhere, ever. A paid month gets `check`, not a money bag.
 */

export interface IconProps {
  size?: number;
  className?: string;
}

function svg(path: React.ReactNode, { size = 18, className }: IconProps) {
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

/** Properties. */
export const IconHouse = (p: IconProps) =>
  svg(
    <>
      <path d="M3 8.6 10 3l7 5.6" />
      <path d="M4.6 9.9V17h10.8V9.9" />
      <path d="M8.2 17v-4.4h3.6V17" />
    </>,
    p,
  );

/** Listings and vacancies. */
export const IconKey = (p: IconProps) =>
  svg(
    <>
      <circle cx="6.6" cy="6.6" r="3.1" />
      <path d="M8.9 8.9 16 16" />
      <path d="M13.3 13.3l-1.6 1.6M15 15l-1.6 1.6" />
    </>,
    p,
  );

/** Rent. */
export const IconLedger = (p: IconProps) =>
  svg(
    <>
      <path d="M4.4 3.4h9.4a1.6 1.6 0 0 1 1.6 1.6v11.6H6a1.6 1.6 0 0 1-1.6-1.6V3.4Z" />
      <path d="M4.4 14.2h11" />
      <path d="M7.6 6.6h4.8M7.6 9.4h4.8" />
    </>,
    p,
  );

/** Maintenance. */
export const IconWrench = (p: IconProps) =>
  svg(
    <>
      <path d="M12.4 3.2a4.2 4.2 0 0 0-4.9 5.4L3 13.1v3.7h3.6l4.5-4.6a4.2 4.2 0 0 0 5.4-4.9l-2.4 2.4-2.2-.6-.6-2.2 2.4-2.4Z" />
      <path d="M5.4 14.4h.01" />
    </>,
    p,
  );

/** The File. */
export const IconFolderFile = (p: IconProps) =>
  svg(
    <>
      <path d="M2.6 5.6a1.4 1.4 0 0 1 1.4-1.4h3.2l1.6 2h6.2a1.4 1.4 0 0 1 1.4 1.4v7.4a1.4 1.4 0 0 1-1.4 1.4H4a1.4 1.4 0 0 1-1.4-1.4V5.6Z" />
      <path d="M6.8 11.4h6.4M6.8 14h4.2" />
    </>,
    p,
  );

export const IconCamera = (p: IconProps) =>
  svg(
    <>
      <path d="M2.8 7.4a1.4 1.4 0 0 1 1.4-1.4h1.9l1.1-1.8h3.6L12 6h3.8a1.4 1.4 0 0 1 1.4 1.4v7.2a1.4 1.4 0 0 1-1.4 1.4H4.2a1.4 1.4 0 0 1-1.4-1.4V7.4Z" />
      <circle cx="10" cy="11" r="2.6" />
    </>,
    p,
  );

/** E-sign. */
export const IconSignature = (p: IconProps) =>
  svg(
    <>
      <path d="M2.6 13.4c2.2 0 2.6-8.4 4.8-8.4 1.7 0 .8 6.9 2.6 6.9 1.3 0 1.4-3.7 2.8-3.7 1.2 0 1 2.6 2.2 2.6.8 0 1.2-.7 1.4-1.2" />
      <path d="M3 16.8h14" />
    </>,
    p,
  );

/** Screening. */
export const IconShieldCheck = (p: IconProps) =>
  svg(
    <>
      <path d="M10 2.6 4.4 4.8v4.5c0 3.4 2.3 6.4 5.6 7.5 3.3-1.1 5.6-4.1 5.6-7.5V4.8L10 2.6Z" />
      <path d="M7.4 9.8 9.4 12l3.4-4" />
    </>,
    p,
  );

export const IconBell = (p: IconProps) =>
  svg(
    <>
      <path d="M5.5 8.5a4.5 4.5 0 0 1 9 0c0 3 .8 4.4 1.5 5.2H4c.7-.8 1.5-2.2 1.5-5.2Z" />
      <path d="M8.2 16.2a2 2 0 0 0 3.6 0" />
    </>,
    p,
  );

export const IconSend = (p: IconProps) =>
  svg(
    <>
      <path d="M17.2 3.2 2.8 8.6l5.6 2.2 2.2 5.6 6.6-13.2Z" />
      <path d="M8.4 10.8 17.2 3.2" />
    </>,
    p,
  );

export const IconCheck = (p: IconProps) => svg(<path d="M4 10.5l4 4 8-9" />, p);

export const IconClock = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 5.8V10l3 1.8" />
    </>,
    p,
  );

export const IconChevronRight = (p: IconProps) => svg(<path d="M8 5l5 5-5 5" />, p);

export const IconPlus = (p: IconProps) => svg(<path d="M10 4v12M4 10h12" />, p);

export const IconDownload = (p: IconProps) =>
  svg(
    <>
      <path d="M10 3v9" />
      <path d="M6.4 8.8 10 12.4l3.6-3.6" />
      <path d="M3.6 15.4h12.8" />
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

export const IconLink = (p: IconProps) =>
  svg(
    <>
      <path d="M8.4 11.6 11.6 8.4" />
      <path d="M7.2 13.6l-1 1a2.9 2.9 0 0 1-4.1-4.1l2.6-2.6a2.9 2.9 0 0 1 4.1 0" />
      <path d="M12.8 6.4l1-1a2.9 2.9 0 0 1 4.1 4.1l-2.6 2.6a2.9 2.9 0 0 1-4.1 0" />
    </>,
    p,
  );
