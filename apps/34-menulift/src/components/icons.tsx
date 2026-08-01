/**
 * The icon set. One family, 20×20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor`. No emoji anywhere in this product — DESIGN_LANGUAGE.md rule 1.
 *
 * Nav renders at 22px, inline at 18px. The glyph list is exactly the one
 * DESIGN.md's iconography section requires.
 *
 * Pure presentational module: safe in client components.
 */

export interface IconProps {
  size?: number;
  className?: string;
  /** Decorative by default; pass a label when the icon is the only content. */
  label?: string;
}

function Svg({
  size = 20,
  className,
  label,
  children,
}: IconProps & { children: React.ReactNode }) {
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
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      className={className}
    >
      {children}
    </svg>
  );
}

export function IconQr(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1" />
      <rect x="12" y="2.5" width="5.5" height="5.5" rx="1" />
      <rect x="2.5" y="12" width="5.5" height="5.5" rx="1" />
      <path d="M12 12h2.5M17.5 12v2.5M12 17.5h5.5" />
    </Svg>
  );
}

export function IconCamera(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 6.75A1.75 1.75 0 0 1 4.25 5h1.4l1-1.75h4.7L12.35 5h3.4a1.75 1.75 0 0 1 1.75 1.75v7.5A1.75 1.75 0 0 1 15.75 16H4.25a1.75 1.75 0 0 1-1.75-1.75Z" />
      <circle cx="10" cy="10.25" r="2.75" />
    </Svg>
  );
}

/** The enhance spark — a starburst over a lens. Never called "magic". */
export function IconRelight(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11.5" r="4.25" />
      <path d="M5.5 2.5v3.5M3.75 4.25h3.5M15.5 3v2.4M14.3 4.2h2.4" />
    </Svg>
  );
}

export function IconSlash86(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M5.4 14.6 14.6 5.4" />
    </Svg>
  );
}

export function IconGridMatrix(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.75" y="2.75" width="14.5" height="14.5" rx="1.5" />
      <path d="M10 2.75v14.5M2.75 10h14.5" />
    </Svg>
  );
}

export function IconUploadCsv(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 13.5V3.5M6.75 6.75 10 3.5l3.25 3.25" />
      <path d="M3.25 12.5v2.75A1.25 1.25 0 0 0 4.5 16.5h11a1.25 1.25 0 0 0 1.25-1.25V12.5" />
    </Svg>
  );
}

export function IconTagDietary(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.4 2.75H16a1.25 1.25 0 0 1 1.25 1.25v5.6a1.5 1.5 0 0 1-.44 1.06l-6 6a1.5 1.5 0 0 1-2.12 0l-5.1-5.1a1.5 1.5 0 0 1 0-2.12l6-6a1.5 1.5 0 0 1 1.06-.44Z" />
      <circle cx="13.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconClockDaypart(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 6.25V10l2.5 1.75" />
    </Svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7.75 4.5 13.25 10l-5.5 5.5" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4.25v11.5M4.25 10h11.5" />
    </Svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.75 10S4.75 4.75 10 4.75 18.25 10 18.25 10 15.25 15.25 10 15.25 1.75 10 1.75 10Z" />
      <circle cx="10" cy="10" r="2.5" />
    </Svg>
  );
}

export function IconPrinter(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.75 7.5V3.25h8.5V7.5" />
      <path d="M5.75 14.25H4.5A1.25 1.25 0 0 1 3.25 13V8.75A1.25 1.25 0 0 1 4.5 7.5h11a1.25 1.25 0 0 1 1.25 1.25V13a1.25 1.25 0 0 1-1.25 1.25h-1.25" />
      <rect x="5.75" y="11.5" width="8.5" height="5.25" rx="1" />
    </Svg>
  );
}

export function IconMenuList(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.25 5.5h13.5M3.25 10h13.5M3.25 14.5h8" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.25 10.5 8 14.25l7.75-8.5" />
    </Svg>
  );
}

export function IconDrag(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 5.5h.01M7 10h.01M7 14.5h.01M13 5.5h.01M13 10h.01M13 14.5h.01" strokeWidth={2.5} />
    </Svg>
  );
}

export function IconArrowUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 15.75V4.25M5.5 8.75 10 4.25l4.5 4.5" />
    </Svg>
  );
}

export function IconArrowDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4.25v11.5M5.5 11.25 10 15.75l4.5-4.5" />
    </Svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.75 6h12.5M8 3.5h4M5.5 6l.6 9.1a1.25 1.25 0 0 0 1.25 1.15h5.3a1.25 1.25 0 0 0 1.25-1.15L14.5 6" />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.75v1.6M10 15.65v1.6M3.9 6.4l1.4.8M14.7 12.8l1.4.8M3.9 13.6l1.4-.8M14.7 7.2l1.4-.8" />
    </Svg>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 10a6.5 6.5 0 1 0 2-4.7M3.25 3v3h3" />
      <path d="M10 6.75V10l2.25 1.5" />
    </Svg>
  );
}
