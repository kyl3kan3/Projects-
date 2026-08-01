/**
 * The icon set. One family, 20x20 viewBox, 1.75 stroke, round caps and joins,
 * currentColor — per DESIGN.md. No emoji anywhere, ever: a verified backup gets
 * `shield-check` in seal green, not a padlock emoji.
 *
 * Nav renders at 22px, inline at 18px.
 */

export interface IconProps {
  size?: number;
  className?: string;
  /** Set on the seal when it should draw itself in. */
  draw?: boolean;
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

/** Vault — a dial door. The brand glyph and the Vault tab. */
export const IconVault = (p: IconProps) =>
  svg(
    <>
      <rect x="2.4" y="3.4" width="15.2" height="13.2" rx="2" />
      <circle cx="11" cy="10" r="3.2" />
      <path d="M11 6.8V5.4M11 14.6v-1.4M14.2 10h1.4M6.4 10h1.4" />
    </>,
    p,
  );

/** Restore — a counterclockwise arrow. */
export const IconRestore = (p: IconProps) =>
  svg(
    <>
      <path d="M3.2 6.6V3.4M3.2 6.6h3.2" />
      <path d="M3.6 7.2A7 7 0 1 1 3 11.4" />
    </>,
    p,
  );

/** Drill — a target with a check. */
export const IconDrill = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3" />
      <path d="M7.6 10.2l1.7 1.7 3.4-3.6" />
    </>,
    p,
  );

export const IconGear = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.6v2M10 15.4v2M3.6 10h2M14.4 10h2M5.4 5.4l1.4 1.4M13.2 13.2l1.4 1.4M14.6 5.4l-1.4 1.4M6.8 13.2l-1.4 1.4" />
    </>,
    p,
  );

export const IconDatabase = (p: IconProps) =>
  svg(
    <>
      <ellipse cx="10" cy="5" rx="6" ry="2.4" />
      <path d="M4 5v10c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4V5" />
      <path d="M4 10c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4" />
    </>,
    p,
  );

export const IconKey = (p: IconProps) =>
  svg(
    <>
      <circle cx="6.6" cy="13.4" r="3" />
      <path d="M8.8 11.2l6.4-6.4M13 7l1.8 1.8M15.2 4.8L17 6.6" />
    </>,
    p,
  );

export const IconLock = (p: IconProps) =>
  svg(
    <>
      <rect x="4.4" y="8.8" width="11.2" height="8" rx="1.6" />
      <path d="M7 8.8V6.6a3 3 0 0 1 6 0v2.2" />
    </>,
    p,
  );

/** shield-check — the verified seal. The only glyph allowed in seal green. */
export const IconShieldCheck = ({ draw, ...p }: IconProps) =>
  svg(
    <>
      <path d="M10 2.6l5.6 2v4.9c0 3.3-2.2 6.2-5.6 7.9-3.4-1.7-5.6-4.6-5.6-7.9V4.6l5.6-2Z" />
      <path className={draw ? "seal-draw" : undefined} d="M7.4 9.9l2 2 3.4-3.9" />
    </>,
    p,
  );

/** bucket — S3 / R2 storage. */
export const IconBucket = (p: IconProps) =>
  svg(
    <>
      <path d="M3.4 5.4h13.2l-1.3 10.2a1.6 1.6 0 0 1-1.6 1.4H6.3a1.6 1.6 0 0 1-1.6-1.4L3.4 5.4Z" />
      <path d="M3.4 5.4C3.4 4 6.3 3 10 3s6.6 1 6.6 2.4" />
    </>,
    p,
  );

/** bolt-slide — two offset bars. Slides right when a backup verifies. */
export const IconBoltSlide = (p: IconProps) =>
  svg(
    <>
      <path d="M3.4 7.6h9.2M6.8 12.4H16" />
    </>,
    p,
  );

export const IconClock = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.2V10l2.6 1.8" />
    </>,
    p,
  );

export const IconDownload = (p: IconProps) =>
  svg(
    <>
      <path d="M10 3.2v8.4M6.8 8.6L10 11.8l3.2-3.2" />
      <path d="M3.6 13.8v1.6a1.4 1.4 0 0 0 1.4 1.4h10a1.4 1.4 0 0 0 1.4-1.4v-1.6" />
    </>,
    p,
  );

export const IconCheck = (p: IconProps) => svg(<path d="M3.6 10.6l3.8 3.8L16.4 5.6" />, p);

export const IconAlertTriangle = (p: IconProps) =>
  svg(
    <>
      <path d="M10 3.4l7 12.2H3L10 3.4Z" />
      <path d="M10 7.8v3.4M10 13.6v.1" />
    </>,
    p,
  );

export const IconChevronRight = (p: IconProps) => svg(<path d="M7.6 4.4l5.2 5.6-5.2 5.6" />, p);

export const IconPlus = (p: IconProps) => svg(<path d="M10 4.2v11.6M4.2 10h11.6" />, p);

export const IconGithub = (p: IconProps) =>
  svg(
    <path d="M7.7 16.6v-2.2c-2.3.4-2.9-1-3.1-1.6-.2-.4-.7-1.2-1.2-1.4-.4-.2 0-.4.5-.3.6.1 1.2.5 1.6 1.2.5.9 1.5 1.2 2.4.8.1-.6.4-1.1.7-1.4-2.3-.4-3.4-1.6-3.4-3.3 0-.8.3-1.6.8-2.2-.2-.6-.1-1.4.1-2 0 0 .8.1 1.8.9a6.2 6.2 0 0 1 3.4 0c1-.8 1.8-.9 1.8-.9.2.6.3 1.4.1 2 .5.6.8 1.4.8 2.2 0 1.7-1.1 2.9-3.4 3.3.4.4.7 1.1.7 1.8v3.1" />,
    p,
  );
