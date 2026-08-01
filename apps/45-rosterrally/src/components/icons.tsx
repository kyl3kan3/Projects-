/**
 * The icon set. One family, 20×20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor`. Nav renders at 22px, inline at 18px.
 *
 * DESIGN.md names the required glyphs and this file has exactly those plus the
 * handful the flows need. **No emoji anywhere, ever** — a cleared conflict gets
 * `IconCheck`, never a trophy.
 */

export interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

function Svg({
  size = 20,
  className,
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
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      {children}
    </svg>
  );
}

/** Season — a coach's whistle. */
export const IconWhistle = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7.75" cy="11.5" r="4.5" />
    <path d="M11.5 8.9 17.25 6.4" />
    <path d="M12.25 11.5h5" />
    <path d="M8.5 3.25h4.25" />
    <path d="M10.6 3.25V6.6" />
  </Svg>
);

/** Rosters — stacked rows with a number gutter. */
export const IconRosterRows = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.75 4.75h14.5M2.75 10h14.5M2.75 15.25h14.5" />
    <path d="M6.25 2.75v14.5" />
  </Svg>
);

/** Schedule — a calendar grid. */
export const IconCalendarGrid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.75" y="4.25" width="14.5" height="13" rx="2" />
    <path d="M2.75 8.25h14.5M6.75 2.75v3M13.25 2.75v3" />
    <path d="M7.5 11.5h5M7.5 14.25h3" />
  </Svg>
);

/** Comms — a megaphone. */
export const IconMegaphone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8.25 13.5 4.5v11L3 11.75z" />
    <path d="M13.5 7.25c1.6 0 2.75 1.2 2.75 2.75s-1.15 2.75-2.75 2.75" />
    <path d="M5.75 12.25v3.5c0 .7.55 1.25 1.25 1.25s1.25-.55 1.25-1.25v-2.6" />
  </Svg>
);

/** Volunteers — a raised hand. */
export const IconHandRaise = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 9V4.5a1.25 1.25 0 0 1 2.5 0V9" />
    <path d="M9.5 8.5V6.75a1.25 1.25 0 0 1 2.5 0V9.5" />
    <path d="M12 9.5V8.25a1.25 1.25 0 0 1 2.5 0V13c0 2.35-1.9 4.25-4.25 4.25h-1A4.25 4.25 0 0 1 5 13v-2.25" />
    <path d="M7 10.75 5.6 9.3a1.2 1.2 0 0 0-1.7 1.7l1.1 1.1" />
  </Svg>
);

/** The conflict pennant. */
export const IconPennant = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.25 3v14.25" />
    <path d="M5.25 3.75h10.5l-3 3.5 3 3.5H5.25z" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.75 10.5 7.5 14.25 16.25 5.5" />
  </Svg>
);

/** Payments — a card. */
export const IconCard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.25" y="5" width="15.5" height="10.5" rx="2" />
    <path d="M2.25 8.75h15.5" />
    <path d="M5.5 12.25h3" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7.25" />
    <path d="M10 6v4.25l2.75 1.75" />
  </Svg>
);

export const IconMapPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 17.25s5.25-4.4 5.25-8.25a5.25 5.25 0 0 0-10.5 0c0 3.85 5.25 8.25 5.25 8.25z" />
    <circle cx="10" cy="9" r="1.9" />
  </Svg>
);

export const IconSend = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17.25 2.75 8.5 11.5" />
    <path d="M17.25 2.75 12 17.25l-3.5-5.75L2.75 8z" />
  </Svg>
);

/** Read receipts — an eye. */
export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.75 10S4.75 4.75 10 4.75 18.25 10 18.25 10 15.25 15.25 10 15.25 1.75 10 1.75 10z" />
    <circle cx="10" cy="10" r="2.25" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.75 4.75 13 10l-5.25 5.25" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4.25v11.5M4.25 10h11.5" />
  </Svg>
);

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 2.75v9.5" />
    <path d="M6.25 8.75 10 12.5l3.75-3.75" />
    <path d="M3.25 15.25h13.5" />
  </Svg>
);

export const IconArrowUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 15.75V4.5" />
    <path d="M5.5 9 10 4.5 14.5 9" />
  </Svg>
);

export const IconArrowDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4.25v11.25" />
    <path d="M14.5 11 10 15.5 5.5 11" />
  </Svg>
);

export const IconMinus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.25 10h11.5" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.25" y="8.75" width="11.5" height="8.5" rx="2" />
    <path d="M7 8.75V6.5a3 3 0 0 1 6 0v2.25" />
  </Svg>
);

export const IconMail = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.25" y="4.75" width="15.5" height="10.5" rx="2" />
    <path d="m2.75 5.75 7.25 5.5 7.25-5.5" />
  </Svg>
);

export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 2.75h-2A1.75 1.75 0 0 0 2.75 4.5c0 6.9 5.85 12.75 12.75 12.75A1.75 1.75 0 0 0 17.25 15.5v-2l-3.75-1.25-1.75 2A11.4 11.4 0 0 1 7.75 8.5l2-1.75z" />
  </Svg>
);
