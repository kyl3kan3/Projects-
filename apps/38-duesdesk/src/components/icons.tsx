/**
 * The icon set. One family, 20×20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor`. Nav renders at 22px, inline at 18px.
 *
 * DESIGN.md names the required glyphs and this file has exactly those, plus the
 * handful the flows need. **No emoji anywhere, ever** — a paid invoice gets
 * `seal-check`, not a money bag.
 */

export interface IconProps {
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
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Dues — a receipt with a torn foot. */
export const IconReceipt = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 2.75h10v13.2l-2.5-1.4-2.5 1.4-2.5-1.4L5 15.95z" />
    <path d="M8 6.75h4M8 9.75h4" />
  </Svg>
);

/** Roster — a row of people. */
export const IconPeople = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7.25" cy="7" r="2.5" />
    <path d="M2.75 16c0-2.35 2-4.25 4.5-4.25s4.5 1.9 4.5 4.25" />
    <path d="M13.25 5.1a2.5 2.5 0 0 1 0 4.8M14.5 11.9c1.6.55 2.75 2.05 2.75 3.85" />
  </Svg>
);

/** Issues — a small gavel. */
export const IconGavel = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.6 12.9 9.9 7.6" />
    <path d="m8.2 4.2 4.2 4.2-2.1 2.1-4.2-4.2z" />
    <path d="M13.4 9.4 16 12l-1.6 1.6L11.8 11z" />
    <path d="M2.75 17.25h7" />
  </Svg>
);

/** Announce — a flat horn. */
export const IconHorn = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8.25v3.5l3.5.5 8 3.25V4.5L6.5 7.75z" />
    <path d="M6.5 7.75v4.5" />
  </Svg>
);

export const IconGear = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2.75v1.9M10 15.35v1.9M3.85 6.4l1.65.95M14.5 12.65l1.65.95M3.85 13.6l1.65-.95M14.5 7.35l1.65-.95" />
  </Svg>
);

/** Paid — a ring with a check. The association's mark. */
export const IconSealCheck = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7.25" />
    <path d="m6.75 10.2 2.2 2.2 4.3-4.8" />
  </Svg>
);

/** ACH — a bank front. */
export const IconBank = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.75 7.75 10 3.25l7.25 4.5" />
    <path d="M4.75 7.75v8.5M15.25 7.75v8.5M8.25 10.5v5.75M11.75 10.5v5.75" />
    <path d="M2.75 16.25h14.5" />
  </Svg>
);

export const IconCard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.75" y="4.75" width="14.5" height="10.5" rx="2" />
    <path d="M2.75 8.5h14.5M5.75 12.25h3" />
  </Svg>
);

export const IconCamera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.75 7.5A1.75 1.75 0 0 1 4.5 5.75h1.4l1-1.75h4.2l1 1.75h1.4a1.75 1.75 0 0 1 1.75 1.75v6.25a1.75 1.75 0 0 1-1.75 1.75h-9A1.75 1.75 0 0 1 2.75 13.75z" />
    <circle cx="10" cy="10.5" r="2.5" />
  </Svg>
);

/** Documents — lined paper. */
export const IconFileLines = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 2.75h6.5L15 6.25v11H5z" />
    <path d="M11.25 2.75v3.5H15" />
    <path d="M7.75 10h4.5M7.75 13h4.5" />
  </Svg>
);

export const IconSend = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17.25 2.75 8.5 11.5" />
    <path d="M17.25 2.75 12 17.25l-3.5-5.75-5.75-3.5z" />
  </Svg>
);

/** Autopay — the repeat arrows. */
export const IconRepeat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8.5V7.25A2.5 2.5 0 0 1 6.5 4.75h8.25" />
    <path d="m12.5 2.5 2.25 2.25-2.25 2.25" />
    <path d="M16 11.5v1.25a2.5 2.5 0 0 1-2.5 2.5H5.25" />
    <path d="M7.5 17.5 5.25 15.25 7.5 13" />
  </Svg>
);

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3v9.25" />
    <path d="m6.5 9 3.5 3.5L13.5 9" />
    <path d="M3.75 16.25h12.5" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m7.75 4.5 5.5 5.5-5.5 5.5" />
  </Svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12.25 4.5-5.5 5.5 5.5 5.5" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4v12M4 10h12" />
  </Svg>
);

export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 12.75V3.5" />
    <path d="m6.5 7 3.5-3.5L13.5 7" />
    <path d="M3.75 16.25h12.5" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3.25 17.25 16H2.75z" />
    <path d="M10 8v3.5M10 13.75h.01" />
  </Svg>
);
