/**
 * src/components/icons.tsx
 *
 * One icon set, drawn to one grid: 20×20 viewBox, 1.75px stroke, round caps and
 * joins, `currentColor` only. DESIGN_LANGUAGE rule 1 — an emoji in a shipped
 * screen is a build failure, so there is nowhere else icons come from.
 *
 * Nav icons render at 22px; everything else at 20.
 */

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 20, className, children }: IconProps & { children: React.ReactNode }) {
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
      {children}
    </svg>
  );
}

/** Stacked crates — the yard. */
export function IconYard(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 12.5h6v4.5H3zM11 12.5h6v4.5h-6zM7 6.5h6V11H7z" />
    </Svg>
  );
}

/** A manifest on a clipboard — quotes and orders. */
export function IconManifest(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3.5h8a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M8 3v1.5h4V3M8 8h4M8 11h4M8 14h2" />
    </Svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 5.5h12v11H4zM4 9h12M7.5 3v3M12.5 3v3" />
    </Svg>
  );
}

/** A box truck — runs. */
export function IconTruck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 6.5h8.5V14H2zM10.5 9h3.5l2 2.5V14h-5.5" />
      <circle cx="5" cy="15.5" r="1.5" />
      <circle cx="14" cy="15.5" r="1.5" />
    </Svg>
  );
}

/** An arrow returning into a tray — returns. */
export function IconReturn(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3v7M7 7l3 3 3-3" />
      <path d="M3.5 12v3.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V12" />
    </Svg>
  );
}

export function IconPeople(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="7" r="2.75" />
      <path d="M3 16.5c0-2.5 2.2-4.25 5-4.25s5 1.75 5 4.25" />
      <path d="M13.5 5.5a2.5 2.5 0 0 1 0 5M15 16.5c0-1.6-.5-2.9-1.4-3.8" />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
    </Svg>
  );
}

export function IconCamera(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6.5h3l1.2-2h5.6L14 6.5h3v9H3z" />
      <circle cx="10" cy="11" r="2.75" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4.5v11M4.5 10h11" />
    </Svg>
  );
}

export function IconMinus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 10h11" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10.5 8 14.5 16 6" />
    </Svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3.5 17.5 16.5h-15z" />
      <path d="M10 8v3.5M10 14h.01" />
    </Svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 5l5 5-5 5" />
    </Svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5l-5 5 5 5" />
    </Svg>
  );
}

export function IconChevronUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12l5-5 5 5" />
    </Svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 8l5 5 5-5" />
    </Svg>
  );
}

/** A card with a pause bar — the authorisation hold. */
export function IconHold(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 5.5h14v9H3zM3 9h14" />
      <path d="M6.5 12h2M11 12h2.5" />
    </Svg>
  );
}

export function IconDocument(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 3h6L15 6.5V17h-9.5z" />
      <path d="M11 3v3.5h4M8 10h4M8 13h4" />
    </Svg>
  );
}

export function IconSignature(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 13.5c2.5 0 3-7 5-7s1 6 3 6 2-3 3.5-3 2.5 1.5 2.5 1.5" />
      <path d="M3 16.5h14" />
    </Svg>
  );
}

export function IconWrench(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12.5 3a4 4 0 0 0-3.3 6.2L3 15.4V17h1.6l6.2-6.2A4 4 0 0 0 17 7.5l-2.3 2.3-2.2-2.2L14.8 5.3A4 4 0 0 0 12.5 3Z" />
    </Svg>
  );
}
