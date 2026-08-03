/**
 * The icon set: one family, 20×20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor`. DESIGN.md names the required glyphs and this file is all of
 * them — no emoji anywhere in the product, ever.
 *
 * `stamp` doubles as the brand mark: a rounded rectangle with a check inside, the
 * clerk's approval landing on your application.
 */

export interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

function Svg({
  size = 20,
  className,
  strokeWidth = 1.75,
  style,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {children}
    </svg>
  );
}

/** The brand mark and the verification signal. */
export function IconStamp(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.6" y="3.4" width="14.8" height="13.2" rx="3" />
      <path d="M6.4 10.1l2.6 2.6 4.6-5" />
    </Svg>
  );
}

export function IconClipboardCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7.2 3.2h5.6v2.2H7.2z" />
      <path d="M12.8 4.3h2.1a1 1 0 011 1v10.4a1 1 0 01-1 1H5.1a1 1 0 01-1-1V5.3a1 1 0 011-1h2.1" />
      <path d="M7.4 11l1.9 1.9 3.4-3.7" />
    </Svg>
  );
}

export function IconBuilding(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.4 17h13.2" />
      <path d="M5.2 17V4.2a1 1 0 011-1h4.2a1 1 0 011 1V17" />
      <path d="M11.4 8.2h3.4a1 1 0 011 1V17" />
      <path d="M7.4 6.4h2M7.4 9.2h2M7.4 12h2M13.4 11.4h.6M13.4 14h.6" />
    </Svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3.2a4.4 4.4 0 00-4.4 4.4c0 3.2-1.2 4.3-1.2 4.3h11.2s-1.2-1.1-1.2-4.3A4.4 4.4 0 0010 3.2z" />
      <path d="M8.4 14.4a1.8 1.8 0 003.2 0" />
    </Svg>
  );
}

export function IconCalendarInspection(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.2" y="4.6" width="13.6" height="12" rx="2" />
      <path d="M3.2 8.2h13.6M7 3.2v2.6M13 3.2v2.6" />
      <path d="M7.6 12.2l1.6 1.6 3-3.2" />
    </Svg>
  );
}

export function IconFileBadge(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11.2 2.8H5.8a1 1 0 00-1 1v12.4a1 1 0 001 1h8.4a1 1 0 001-1V6.8z" />
      <path d="M11.2 2.8v4h4" />
      <circle cx="10" cy="11.4" r="2.1" />
      <path d="M8.6 13.2l-.5 2.4 1.9-1 1.9 1-.5-2.4" />
    </Svg>
  );
}

export function IconMapPin(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 17.2s5-4.6 5-8.2a5 5 0 10-10 0c0 3.6 5 8.2 5 8.2z" />
      <circle cx="10" cy="8.8" r="1.9" />
    </Svg>
  );
}

/** Re-verify. */
export function IconRefresh(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16.2 10a6.2 6.2 0 10-2.1 4.7" />
      <path d="M16.4 4.6v4h-4" />
    </Svg>
  );
}

/** Rule change. */
export function IconAlertTriangle(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3.6l6.6 11.6a1 1 0 01-.9 1.5H4.3a1 1 0 01-.9-1.5z" />
      <path d="M10 8.2v3.4M10 14.1h.01" />
    </Svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 5.2l5 4.8-5 4.8" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4.4v11.2M4.4 10h11.2" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9.1" cy="9.1" r="5.1" />
      <path d="M12.9 12.9l3.1 3.1" />
    </Svg>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12.4 5.2L7.6 10l4.8 4.8" />
      <path d="M7.6 10h8" />
    </Svg>
  );
}

/** Settings. Same family: 20x20, 1.75 stroke, round joins. */
export function IconGear(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.4v2.1M10 15.5v2.1M3.6 6.2l1.8 1.05M14.6 12.75l1.8 1.05M3.6 13.8l1.8-1.05M14.6 7.25l1.8-1.05" />
    </Svg>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11.2 4.4h4.4v4.4" />
      <path d="M15.6 4.4L9.4 10.6" />
      <path d="M14.2 11.8v3.4a1 1 0 01-1 1H5.8a1 1 0 01-1-1V7.8a1 1 0 011-1h3.4" />
    </Svg>
  );
}
