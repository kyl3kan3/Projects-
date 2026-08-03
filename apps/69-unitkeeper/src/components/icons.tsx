/**
 * One icon set: 20×20 viewBox, 1.75px stroke, round caps and joins, no fills.
 * Nav icons render at 22px. Nothing else in the product draws a glyph — no emoji,
 * ever (DESIGN_LANGUAGE rule 1).
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
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** The yard: a grid of doors. */
export function IconMap(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="3.5" width="6" height="5" rx="1" />
      <rect x="11.5" y="3.5" width="6" height="5" rx="1" />
      <rect x="2.5" y="11.5" width="6" height="5" rx="1" />
      <rect x="11.5" y="11.5" width="6" height="5" rx="1" />
    </Svg>
  );
}

/** Delinquency: a clock past the hour. */
export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4.2l2.8 1.8" />
    </Svg>
  );
}

/** The lien file: a document with a seal line. */
export function IconLien(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 2.5h6.5L15.5 6v11.5H5z" />
      <path d="M11 2.5V6h4.5" />
      <path d="M7.5 10.5h5M7.5 13.5h3" />
    </Svg>
  );
}

/** Rates: a price tag. */
export function IconTag(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.6 2.6H16a1.4 1.4 0 0 1 1.4 1.4v5.4L9.3 17.5a1.4 1.4 0 0 1-2 0l-4.8-4.8a1.4 1.4 0 0 1 0-2z" />
      <circle cx="13.4" cy="6.6" r="1.1" />
    </Svg>
  );
}

/** Reports: three bars. */
export function IconBars(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 16V9M10 16V4M16 16v-5" />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h9M15.5 6H17M3 14h3M9 14h8" />
      <circle cx="13.5" cy="6" r="2" />
      <circle cx="7.5" cy="14" r="2" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </Svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="8.5" width="12" height="8.5" rx="1.5" />
      <path d="M7 8.5V6.5a3 3 0 0 1 6 0v2" />
    </Svg>
  );
}

export function IconKey(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6.5" cy="13.5" r="3" />
      <path d="M8.7 11.3L16 4M13.5 4H16v2.5" />
    </Svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 10h13M11.5 5l5 5-5 5" />
    </Svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3v9M6.5 8.5L10 12l3.5-3.5" />
      <path d="M3.5 15.5h13" />
    </Svg>
  );
}

export function IconMail(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
      <path d="M3 6l7 5 7-5" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4v12M4 10h12" />
    </Svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3.5l7 12.5H3z" />
      <path d="M10 8v3.5M10 13.8v.2" />
    </Svg>
  );
}
