/**
 * The icon set. One family, 20x20 viewBox, 1.75 stroke, round caps and joins,
 * currentColor — per DESIGN.md. Nav renders at 22px, inline at 18px.
 *
 * No emoji anywhere, ever: a stockout is a rust dot and a date, not a siren.
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

/** Overview — three shelf lines, one short. */
export const IconShelf = (p: IconProps) =>
  svg(
    <>
      <path d="M2.5 5.5h15M2.5 10h15M2.5 14.5h9" />
    </>,
    p,
  );

/** Order-by — an hourglass. */
export const IconHourglass = (p: IconProps) =>
  svg(
    <>
      <path d="M6 2.5h8M6 17.5h8" />
      <path d="M6.5 2.5v2.6c0 1.4 3.5 3.3 3.5 4.9s-3.5 3.5-3.5 4.9v2.6" />
      <path d="M13.5 2.5v2.6c0 1.4-3.5 3.3-3.5 4.9s3.5 3.5 3.5 4.9v2.6" />
    </>,
    p,
  );

/** PO drafts — a clipboard. */
export const IconClipboard = (p: IconProps) =>
  svg(
    <>
      <rect x="4" y="4" width="12" height="13.5" rx="1.8" />
      <path d="M7.5 4V2.8h5V4" />
      <path d="M7.5 9h5M7.5 12.5h3" />
    </>,
    p,
  );

/** Suppliers — a delivery truck. */
export const IconTruck = (p: IconProps) =>
  svg(
    <>
      <path d="M1.8 5.5h9.4v8H1.8z" />
      <path d="M11.2 8.2h3.3l2.7 2.8v2.5h-6z" />
      <circle cx="5.4" cy="15.4" r="1.6" />
      <circle cx="13.6" cy="15.4" r="1.6" />
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

/** Velocity rising. */
export const IconArrowUpRight = (p: IconProps) =>
  svg(
    <>
      <path d="M5.5 14.5l9-9" />
      <path d="M8.8 5.5h5.7v5.7" />
    </>,
    p,
  );

/** Velocity falling. */
export const IconArrowDownRight = (p: IconProps) =>
  svg(
    <>
      <path d="M5.5 5.5l9 9" />
      <path d="M14.5 8.8v5.7H8.8" />
    </>,
    p,
  );

/** Velocity flat. */
export const IconArrowRight = (p: IconProps) => svg(<path d="M3.5 10h13M12 5.5l4.5 4.5-4.5 4.5" />, p);

export const IconSnooze = (p: IconProps) =>
  svg(
    <>
      <path d="M16.5 11.2A6.8 6.8 0 1 1 8.8 3.5a5.3 5.3 0 0 0 7.7 7.7Z" />
      <path d="M12.5 3h3.8l-3.8 4h3.8" />
    </>,
    p,
  );

export const IconCheck = (p: IconProps) => svg(<path d="M4 10.5l4 4 8-9" />, p);

export const IconDownload = (p: IconProps) =>
  svg(
    <>
      <path d="M10 3v9" />
      <path d="M6.2 8.5 10 12.3l3.8-3.8" />
      <path d="M3.5 15.5h13" />
    </>,
    p,
  );

export const IconSend = (p: IconProps) =>
  svg(
    <>
      <path d="M17.2 3 2.8 8.4l5.6 2.1 2.1 5.6z" />
      <path d="M8.4 10.5 17.2 3" />
    </>,
    p,
  );

export const IconPlus = (p: IconProps) => svg(<path d="M10 4v12M4 10h12" />, p);

export const IconChevronRight = (p: IconProps) => svg(<path d="M8 5l5 5-5 5" />, p);

export const IconMagnifier = (p: IconProps) =>
  svg(
    <>
      <circle cx="8.8" cy="8.8" r="5.3" />
      <path d="M12.8 12.8 17 17" />
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

export const IconTrend = ({ trend, ...rest }: IconProps & { trend: "rising" | "flat" | "falling" }) => {
  if (trend === "rising") return <IconArrowUpRight {...rest} />;
  if (trend === "falling") return <IconArrowDownRight {...rest} />;
  return <IconArrowRight {...rest} />;
};
