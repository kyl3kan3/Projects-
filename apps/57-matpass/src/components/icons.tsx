/**
 * The icon set. One family, 20x20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor`. Nav renders at 22px, inline at 18px, kiosk at 26px.
 *
 * DESIGN_LANGUAGE rule 1: no emoji, anywhere, ever. A promotion gets the stripe
 * animation, not a party emoji.
 */

export interface IconProps {
  size?: number;
  className?: string;
}

function Svg({
  size = 20,
  className = "",
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
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** The brand mark: a horizontal belt with one stripe. */
export function IconBeltBar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="7" width="17" height="6" rx="2" />
      <path d="M14.5 7v6" />
    </Svg>
  );
}

export function IconDoorCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 2.5h8a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4z" />
      <path d="M9.5 10h7" />
      <path d="M14 7.5 16.5 10 14 12.5" />
    </Svg>
  );
}

export function IconRosterRows(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 5h15M2.5 10h15M2.5 15h15" />
      <circle cx="5" cy="5" r="0.01" />
    </Svg>
  );
}

export function IconLadderRanks(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 2.5v15M14 2.5v15" />
      <path d="M6 6h8M6 10h8M6 14h8" />
    </Svg>
  );
}

export function IconGradingList(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4.5h9M7 10h9M7 15.5h9" />
      <path d="M2.5 4.5 3.8 5.8 5.5 3.5" />
      <path d="M2.5 10 3.8 11.3 5.5 9" />
      <path d="M3 15.5h1" />
    </Svg>
  );
}

export function IconFlagDrop(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 2.5v15" />
      <path d="M5 3.5h9l-1.6 3.2L14 10H5z" />
    </Svg>
  );
}

export function IconFamilyCluster(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6.5" cy="6" r="2.5" />
      <circle cx="14" cy="7.5" r="2" />
      <path d="M2.5 16c0-2.2 1.8-4 4-4s4 1.8 4 4" />
      <path d="M12 16c0-1.7 1.1-3 2.5-3s2.5 1.3 2.5 3" />
    </Svg>
  );
}

export function IconCalendarClass(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="4" width="15" height="13.5" rx="2" />
      <path d="M2.5 8h15M6.5 2.5v3M13.5 2.5v3" />
    </Svg>
  );
}

export function IconCardPayment(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="4.5" width="17" height="11" rx="2" />
      <path d="M1.5 8.5h17M5 12.5h3" />
    </Svg>
  );
}

export function IconHornFlat(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 8v4h3l5 3.5V4.5L6 8z" />
      <path d="M14 7.5c1 1.5 1 3.5 0 5" />
      <path d="M16.5 5.5c1.7 2.5 1.7 6.5 0 9" />
    </Svg>
  );
}

export function IconSignoffPen(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 17.5h15" />
      <path d="M4 13.5 13.5 4a1.8 1.8 0 0 1 2.5 2.5L6.5 16l-3 .5z" />
    </Svg>
  );
}

export function IconPauseBand(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="7" width="17" height="6" rx="2" />
      <path d="M8 7v6M12 7v6" />
    </Svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 2.5v10" />
      <path d="M6 9l4 3.5L14 9" />
      <path d="M2.5 15.5v1a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-1" />
    </Svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7.5 4l6 6-6 6" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3.5v13M3.5 10h13" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 10.5 7.5 14.5 16.5 5.5" />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="2.8" />
      <path d="M10 1.8v2.4M10 15.8v2.4M2.6 6l2 1.2M15.4 12.8l2 1.2M2.6 14l2-1.2M15.4 7.2l2-1.2" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8.75" cy="8.75" r="5.25" />
      <path d="M12.75 12.75 17 17" />
    </Svg>
  );
}

export function IconWarning(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3 18 16.5H2z" />
      <path d="M10 8v3.5M10 14h.01" />
    </Svg>
  );
}
