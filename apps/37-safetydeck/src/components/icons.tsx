/**
 * The icon set. One family, 20×20 viewBox, 1.75 stroke, round caps and joins,
 * currentColor — per DESIGN.md. Nav renders at 22px, inline at 18px, crew flow
 * at 24px because the person tapping is wearing gloves.
 *
 * No emoji anywhere, ever: a completed sign-off is a check and a timestamp, not
 * a thumbs-up.
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

/** Talks — a flat megaphone. */
export const IconMegaphone = (p: IconProps) =>
  svg(
    <>
      <path d="M3 8.2v3.6a1 1 0 0 0 1 1h2.1l6.4 3.1a.8.8 0 0 0 1.15-.72V4.82a.8.8 0 0 0-1.15-.72L6.1 7.2H4a1 1 0 0 0-1 1Z" />
      <path d="M16.4 7.4a3.6 3.6 0 0 1 0 5.2" />
      <path d="M6.1 12.8v3.4" />
    </>,
    p,
  );

/** Incidents — a clipboard with a cross. */
export const IconClipboardCross = (p: IconProps) =>
  svg(
    <>
      <path d="M7.2 3.4H5.6A1.6 1.6 0 0 0 4 5v11.4A1.6 1.6 0 0 0 5.6 18h8.8a1.6 1.6 0 0 0 1.6-1.6V5a1.6 1.6 0 0 0-1.6-1.6h-1.6" />
      <path d="M7.2 2.6h5.6v2.2H7.2z" />
      <path d="M10 8.6v5M7.5 11.1h5" />
    </>,
    p,
  );

/** Certs — a card with a badge. */
export const IconCardBadge = (p: IconProps) =>
  svg(
    <>
      <rect x="2.4" y="4.6" width="15.2" height="10.8" rx="1.8" />
      <circle cx="7" cy="9.4" r="1.9" />
      <path d="M4.3 13.4c.5-1.3 1.5-2 2.7-2s2.2.7 2.7 2" />
      <path d="M12.4 8.4h3.2M12.4 11.4h3.2" />
    </>,
    p,
  );

/** Binder — three rings on a spine. */
export const IconBinderRings = (p: IconProps) =>
  svg(
    <>
      <path d="M6.2 2.8h9A1.8 1.8 0 0 1 17 4.6v10.8a1.8 1.8 0 0 1-1.8 1.8h-9" />
      <path d="M6.2 2.8A2.2 2.2 0 0 0 4 5v10a2.2 2.2 0 0 0 2.2 2.2" />
      <path d="M2.6 6.6h3M2.6 10h3M2.6 13.4h3" />
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

/** Sign — a pen on a line. */
export const IconPenLine = (p: IconProps) =>
  svg(
    <>
      <path d="M13.4 3.6l3 3-7.6 7.6-3.6.6.6-3.6z" />
      <path d="M3 17.4h14" />
    </>,
    p,
  );

export const IconCamera = (p: IconProps) =>
  svg(
    <>
      <path d="M3.4 6.8h2.4l1.2-1.8h5.6l1.2 1.8h2.4a1.4 1.4 0 0 1 1.4 1.4v6.2a1.4 1.4 0 0 1-1.4 1.4H3.4A1.4 1.4 0 0 1 2 14.4V8.2a1.4 1.4 0 0 1 1.4-1.4Z" />
      <circle cx="10" cy="11.2" r="2.8" />
    </>,
    p,
  );

export const IconMapPin = (p: IconProps) =>
  svg(
    <>
      <path d="M10 17.4s5.4-4.6 5.4-9a5.4 5.4 0 1 0-10.8 0c0 4.4 5.4 9 5.4 9Z" />
      <circle cx="10" cy="8.2" r="2.1" />
    </>,
    p,
  );

/** Clock, hands at eight. */
export const IconClockEight = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="7.4" />
      <path d="M10 5.6V10l-3 2.2" />
    </>,
    p,
  );

export const IconCloudOff = (p: IconProps) =>
  svg(
    <>
      <path d="M6.2 14.6h7.2a3.1 3.1 0 0 0 .5-6.16 4.6 4.6 0 0 0-7.2-2.6" />
      <path d="M5.9 8.5a3.05 3.05 0 0 0 .3 6.1" />
      <path d="M3 3l14 14" />
    </>,
    p,
  );

export const IconCloudUp = (p: IconProps) =>
  svg(
    <>
      <path d="M6.4 15.2a3.2 3.2 0 0 1-.3-6.38 4.6 4.6 0 0 1 8.86-.6 3.1 3.1 0 0 1-.36 6.18" />
      <path d="M10 17.6v-6M7.8 13.2 10 11l2.2 2.2" />
    </>,
    p,
  );

export const IconCheck = (p: IconProps) => svg(<path d="M4 10.6l3.8 3.6L16 5.8" />, p);

export const IconAlertTriangle = (p: IconProps) =>
  svg(
    <>
      <path d="M10 3.2 2.6 16.2h14.8L10 3.2Z" />
      <path d="M10 8v3.4M10 13.8h.01" />
    </>,
    p,
  );

export const IconDownload = (p: IconProps) =>
  svg(
    <>
      <path d="M10 2.8v9.4M6.4 9l3.6 3.4L13.6 9" />
      <path d="M3.2 16.4h13.6" />
    </>,
    p,
  );

export const IconChevronRight = (p: IconProps) => svg(<path d="M7.6 4.4 13 10l-5.4 5.6" />, p);

export const IconChevronLeft = (p: IconProps) => svg(<path d="M12.4 4.4 7 10l5.4 5.6" />, p);

export const IconPlus = (p: IconProps) => svg(<path d="M10 4v12M4 10h12" />, p);

export const IconPrinter = (p: IconProps) =>
  svg(
    <>
      <path d="M5.6 7.6V3.2h8.8v4.4" />
      <path d="M5.6 14.2H4a1.4 1.4 0 0 1-1.4-1.4V9a1.4 1.4 0 0 1 1.4-1.4h12A1.4 1.4 0 0 1 17.4 9v3.8a1.4 1.4 0 0 1-1.4 1.4h-1.6" />
      <path d="M5.6 11.6h8.8v5.2H5.6z" />
    </>,
    p,
  );

export const IconPhone = (p: IconProps) =>
  svg(
    <path d="M6.4 2.8 8.2 6 6.6 7.8a9.4 9.4 0 0 0 5.6 5.6L14 11.8l3.2 1.8v2.2a1.4 1.4 0 0 1-1.5 1.4C8.4 16.6 3.4 11.6 2.8 4.3A1.4 1.4 0 0 1 4.2 2.8Z" />,
    p,
  );

export const IconLink = (p: IconProps) =>
  svg(
    <>
      <path d="M8.4 11.6a3.4 3.4 0 0 0 4.8 0l2.2-2.2a3.4 3.4 0 0 0-4.8-4.8l-1 1" />
      <path d="M11.6 8.4a3.4 3.4 0 0 0-4.8 0l-2.2 2.2a3.4 3.4 0 0 0 4.8 4.8l1-1" />
    </>,
    p,
  );

export const IconUsers = (p: IconProps) =>
  svg(
    <>
      <circle cx="7.6" cy="7" r="2.6" />
      <path d="M2.8 16.2c0-2.6 2.1-4.4 4.8-4.4s4.8 1.8 4.8 4.4" />
      <path d="M13.6 5.2a2.4 2.4 0 0 1 0 4.6M14.4 11.9c1.7.5 2.8 1.9 2.8 4.3" />
    </>,
    p,
  );

export const IconTrash = (p: IconProps) =>
  svg(
    <>
      <path d="M3.4 5.8h13.2M8.2 5.8V3.6h3.6v2.2" />
      <path d="M5.4 5.8l.7 10.2a1.2 1.2 0 0 0 1.2 1.1h5.4a1.2 1.2 0 0 0 1.2-1.1l.7-10.2" />
      <path d="M8.6 9v5M11.4 9v5" />
    </>,
    p,
  );
