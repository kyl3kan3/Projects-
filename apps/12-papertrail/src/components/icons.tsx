/**
 * The icon set: one family, 20×20 viewBox, 1.75 stroke, round caps and joins,
 * currentColor — per DESIGN.md. Nav renders at 22px, inline at 18px.
 *
 * No emoji anywhere, ever. Status is the seal chip's word plus its dot, never a
 * coloured circle glyph.
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

/** A sheet of paper with lines — documents. */
export const IconFileText = (p: IconProps) =>
  svg(
    <>
      <path d="M11.5 2.5H5.8A1.3 1.3 0 0 0 4.5 3.8v12.4a1.3 1.3 0 0 0 1.3 1.3h8.4a1.3 1.3 0 0 0 1.3-1.3V6.5Z" />
      <path d="M11.5 2.5v4h4M7.2 10.5h5.6M7.2 13.5h4" />
    </>,
    p,
  );

/** Pen nib — sign. */
export const IconPenNib = (p: IconProps) =>
  svg(
    <>
      <path d="M15.5 2.5 8 10l-2 5.5L11.5 13l7.5-7.5-3.5-3Z" transform="translate(-1.5 0.5)" />
      <path d="M6.4 11.2 4 17.5" />
      <circle cx="8.2" cy="10.6" r="1.1" />
    </>,
    p,
  );

/** Wax seal — a circle with a ribbon. Signed / paid. */
export const IconSeal = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="8" r="5" />
      <path d="M7.4 12.4 6.5 18l3.5-2 3.5 2-.9-5.6" />
    </>,
    p,
  );

export const IconSend = (p: IconProps) =>
  svg(
    <>
      <path d="M17.5 2.5 8.8 11.2" />
      <path d="M17.5 2.5 12.3 17.5l-3.5-6.3-6.3-3.5Z" />
    </>,
    p,
  );

/** Bell — reminders. */
export const IconBell = (p: IconProps) =>
  svg(
    <>
      <path d="M5.5 8.5a4.5 4.5 0 0 1 9 0c0 3 .8 4.4 1.5 5.2H4c.7-.8 1.5-2.2 1.5-5.2Z" />
      <path d="M8.2 16.2a2 2 0 0 0 3.6 0" />
    </>,
    p,
  );

export const IconBanknote = (p: IconProps) =>
  svg(
    <>
      <rect x="2" y="5.5" width="16" height="9" rx="1.4" />
      <circle cx="10" cy="10" r="2.1" />
      <path d="M5 8v4M15 8v4" />
    </>,
    p,
  );

/** Link — the chain thread. */
export const IconLink = (p: IconProps) =>
  svg(
    <>
      <path d="M8.4 11.6a2.8 2.8 0 0 1 0-4l2.2-2.2a2.8 2.8 0 0 1 4 4l-1 1" />
      <path d="M11.6 8.4a2.8 2.8 0 0 1 0 4l-2.2 2.2a2.8 2.8 0 0 1-4-4l1-1" />
    </>,
    p,
  );

export const IconCopy = (p: IconProps) =>
  svg(
    <>
      <rect x="7" y="7" width="9" height="9" rx="1.6" />
      <path d="M13 4.5H5.6A1.6 1.6 0 0 0 4 6.1V13" />
    </>,
    p,
  );

export const IconDownload = (p: IconProps) =>
  svg(
    <>
      <path d="M10 3v9M6.2 8.6 10 12.4l3.8-3.8" />
      <path d="M3.5 15.5h13" />
    </>,
    p,
  );

export const IconChevronLeft = (p: IconProps) => svg(<path d="M12 5l-5 5 5 5" />, p);
export const IconChevronRight = (p: IconProps) => svg(<path d="M8 5l5 5-5 5" />, p);
export const IconPlus = (p: IconProps) => svg(<path d="M10 4v12M4 10h12" />, p);
export const IconCheck = (p: IconProps) => svg(<path d="M4 10.5l4 4 8-9" />, p);

export const IconClock = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.8V10l3 1.8" />
    </>,
    p,
  );

/** Chart — income. */
export const IconChart = (p: IconProps) =>
  svg(
    <>
      <path d="M3 16.5h14" />
      <path d="M6 16.5v-5M10 16.5V6M14 16.5v-8" />
    </>,
    p,
  );

/** Building — the client. */
export const IconBuilding = (p: IconProps) =>
  svg(
    <>
      <path d="M4.5 17.5v-13a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v13" />
      <path d="M12.5 8.5h2a1 1 0 0 1 1 1v8" />
      <path d="M7 6.8h3M7 9.8h3M7 12.8h3M3 17.5h14" />
    </>,
    p,
  );

export const IconPencil = (p: IconProps) =>
  svg(
    <>
      <path d="M13.6 3.9l2.5 2.5L7.5 15H5v-2.5Z" />
      <path d="M12 5.5 14.5 8" />
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

export const IconGear = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 1.8v2M10 16.2v2M2.6 6l1.7 1M15.7 13l1.7 1M2.6 14l1.7-1M15.7 7l1.7-1" />
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

export const IconEye = (p: IconProps) =>
  svg(
    <>
      <path d="M1.8 10S4.6 5.2 10 5.2 18.2 10 18.2 10 15.4 14.8 10 14.8 1.8 10 1.8 10Z" />
      <circle cx="10" cy="10" r="2.2" />
    </>,
    p,
  );

export const IconX = (p: IconProps) => svg(<path d="M5 5l10 10M15 5L5 15" />, p);

/** The icon for a document type, so a list stays legible at a glance. */
export function DocTypeIcon({
  type,
  size = 18,
  className,
}: {
  type: "proposal" | "contract" | "invoice";
  size?: number;
  className?: string;
}) {
  if (type === "contract") return <IconPenNib size={size} className={className} />;
  if (type === "invoice") return <IconBanknote size={size} className={className} />;
  return <IconFileText size={size} className={className} />;
}
