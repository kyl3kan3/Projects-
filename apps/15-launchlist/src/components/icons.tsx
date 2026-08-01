/**
 * The icon set. One family: 20×20 viewBox, 1.75 stroke, round caps and joins,
 * currentColor — per DESIGN.md. Nav renders at 22px, inline at 18px.
 *
 * No emoji, anywhere, ever. No rocket, no fire. The brand mark is the drawn
 * ascent arrow below and nothing else.
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

/** The brand mark: an arrow climbing, with the trail it left behind. */
export const IconAscent = (p: IconProps) =>
  svg(
    <>
      <path d="M3 16.5c2.2-.6 4-2 5.2-4.2" opacity="0.55" />
      <path d="M6.5 13.5 15 5" />
      <path d="M10.2 4.6H15.4V9.8" />
    </>,
    p,
  );

export const IconMail = (p: IconProps) =>
  svg(
    <>
      <rect x="2.2" y="4.5" width="15.6" height="11" rx="2" />
      <path d="m3.2 6 6.8 4.6 6.8-4.6" />
    </>,
    p,
  );

export const IconLink = (p: IconProps) =>
  svg(
    <>
      <path d="M8.4 11.6a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9" />
      <path d="M11.6 8.4a3 3 0 0 0-4.2 0L4.8 11a3 3 0 0 0 4.2 4.2l.9-.9" />
    </>,
    p,
  );

export const IconCopy = (p: IconProps) =>
  svg(
    <>
      <rect x="7" y="7" width="10.5" height="10.5" rx="2" />
      <path d="M13 4.8a2 2 0 0 0-2-2H4.5a2 2 0 0 0-2 2v6.5a2 2 0 0 0 2 2" />
    </>,
    p,
  );

export const IconShare = (p: IconProps) =>
  svg(
    <>
      <path d="M10 13.5V3.2" />
      <path d="m6.6 6.4 3.4-3.2 3.4 3.2" />
      <path d="M5 10.5H3.6v6.6h12.8v-6.6H15" />
    </>,
    p,
  );

export const IconUsers = (p: IconProps) =>
  svg(
    <>
      <circle cx="7.8" cy="7.2" r="2.8" />
      <path d="M2.6 16.4c0-2.6 2.3-4.4 5.2-4.4s5.2 1.8 5.2 4.4" />
      <path d="M13.6 4.8a2.8 2.8 0 0 1 0 5.3M15 15.8c0-1.6-.5-2.8-1.4-3.6" />
    </>,
    p,
  );

export const IconTrophy = (p: IconProps) =>
  svg(
    <>
      <path d="M6.2 3h7.6v3.4a3.8 3.8 0 0 1-7.6 0Z" />
      <path d="M6.2 4.4H4a2 2 0 0 0 2.4 2.9M13.8 4.4H16a2 2 0 0 1-2.4 2.9" />
      <path d="M10 10.2v3.2M7.2 17h5.6M8.4 13.4h3.2l.6 3.6H7.8Z" />
    </>,
    p,
  );

export const IconGift = (p: IconProps) =>
  svg(
    <>
      <rect x="2.8" y="7.4" width="14.4" height="9.8" rx="1.6" />
      <path d="M2.8 10.8h14.4M10 7.4v9.8" />
      <path d="M10 7.4C8.6 5.4 7.6 4.4 6.4 4.4a1.8 1.8 0 0 0 0 3M10 7.4c1.4-2 2.4-3 3.6-3a1.8 1.8 0 0 1 0 3" />
    </>,
    p,
  );

export const IconLock = (p: IconProps) =>
  svg(
    <>
      <rect x="4.2" y="8.8" width="11.6" height="8.4" rx="1.8" />
      <path d="M6.8 8.8V6.6a3.2 3.2 0 0 1 6.4 0v2.2" />
    </>,
    p,
  );

export const IconUnlock = (p: IconProps) =>
  svg(
    <>
      <rect x="4.2" y="8.8" width="11.6" height="8.4" rx="1.8" />
      <path d="M6.8 8.8V6.6a3.2 3.2 0 0 1 6.1-1.3" className="stroke-draw" />
    </>,
    p,
  );

export const IconChart = (p: IconProps) =>
  svg(
    <>
      <path d="M3 17h14" />
      <path d="M5.4 17V9.6M9.4 17V4.8M13.4 17v-5" />
    </>,
    p,
  );

export const IconFunnel = (p: IconProps) =>
  svg(<path d="M3 4h14l-5.2 6.2V17L8.2 15v-4.8Z" />, p);

export const IconSend = (p: IconProps) =>
  svg(
    <>
      <path d="M17.4 3.2 2.8 8.6l5.6 2.2 2.2 5.6Z" />
      <path d="m8.4 10.8 4.4-4.4" />
    </>,
    p,
  );

export const IconSettings = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.4v2M10 15.6v2M4.6 10h-2M17.4 10h-2M6.2 6.2 4.8 4.8M15.2 15.2l-1.4-1.4M13.8 6.2l1.4-1.4M4.8 15.2l1.4-1.4" />
    </>,
    p,
  );

export const IconChevronLeft = (p: IconProps) => svg(<path d="M12.4 4.4 6.8 10l5.6 5.6" />, p);

export const IconChevronRight = (p: IconProps) => svg(<path d="M7.6 4.4 13.2 10l-5.6 5.6" />, p);

export const IconPlus = (p: IconProps) => svg(<path d="M10 4v12M4 10h12" />, p);

export const IconCheck = (p: IconProps) => svg(<path d="m4 10.6 4 4L16 5.6" />, p);

export const IconX = (p: IconProps) => svg(<path d="M5 5l10 10M15 5 5 15" />, p);

export const IconFlag = (p: IconProps) =>
  svg(
    <>
      <path d="M5 3v14" />
      <path d="M5 4.2h9.8l-1.6 3.4 1.6 3.4H5" />
    </>,
    p,
  );

export const IconCode = (p: IconProps) =>
  svg(
    <>
      <path d="m7 6.6-4 3.4 4 3.4M13 6.6l4 3.4-4 3.4" />
      <path d="M11.4 3.6 8.6 16.4" opacity="0.55" />
    </>,
    p,
  );

export const IconDownload = (p: IconProps) =>
  svg(
    <>
      <path d="M10 3v9M6.6 8.8 10 12.2l3.4-3.4" />
      <path d="M3.4 14v3h13.2v-3" />
    </>,
    p,
  );

export const IconLayout = (p: IconProps) =>
  svg(
    <>
      <rect x="2.8" y="3.2" width="14.4" height="13.6" rx="2" />
      <path d="M2.8 8h14.4M7.6 8v8.8" />
    </>,
    p,
  );

export const IconGlobe = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M2.8 10h14.4" />
      <path d="M10 2.8c1.9 2 2.9 4.4 2.9 7.2s-1 5.2-2.9 7.2c-1.9-2-2.9-4.4-2.9-7.2s1-5.2 2.9-7.2Z" />
    </>,
    p,
  );

/** The wordmark: the ascent mark plus the name, used in headers and footers. */
export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: "var(--color-flare)", display: "inline-flex" }}>
        <IconAscent size={size} />
      </span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 16,
          letterSpacing: "-0.01em",
          color: "var(--color-text)",
        }}
      >
        LaunchList
      </span>
    </span>
  );
}
