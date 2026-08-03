/**
 * src/components/icons.tsx
 *
 * The icon set: one family, 20×20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor` — DESIGN.md's iconography rule and DESIGN_LANGUAGE rule 1's
 * replacement for emoji. Nav renders at 22px, inline at 18px.
 *
 * Every glyph DESIGN.md names is here and nothing else is. A screen that wants a
 * new mark adds it to this file rather than reaching for a library.
 */

import type { SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  size?: number;
}

function Icon({
  size = 20,
  children,
  style,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      // `flex: none` by default: an icon inside a flex row is otherwise a
      // shrinkable flex item, and a long sentence beside it squeezes it to a smudge.
      style={{ flex: "none", ...style }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Record. A microphone with its stand — quiet, not a broadcast icon. */
export const IconMicQuiet = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7.6" y="2.6" width="4.8" height="8.4" rx="2.4" />
    <path d="M4.8 9.4a5.2 5.2 0 0 0 10.4 0" />
    <path d="M10 14.6V17.4M7.4 17.4h5.2" />
  </Icon>
);

/** Upload an audio file. */
export const IconUpload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 13.2V3.4" />
    <path d="M6.4 6.8 10 3.2l3.6 3.6" />
    <path d="M3.4 13.6v2.2a1.2 1.2 0 0 0 1.2 1.2h10.8a1.2 1.2 0 0 0 1.2-1.2v-2.2" />
  </Icon>
);

/** Typed shorthand. */
export const IconPencilLine = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.6 3.4l4 4L8 16H4v-4z" />
    <path d="M3.4 18.2h13.2" />
  </Icon>
);

/** Transcribing. A minimal waveform, four bars. */
export const IconWaveformMin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8v4M7.4 5.6v8.8M12.6 4.4v11.2M16 8v4" />
  </Icon>
);

/** A note. */
export const IconFileText = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 2.8h6.4L15.6 7v10.2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.8a1 1 0 0 1 1-1z" />
    <path d="M11.2 2.9V7h4.3" />
    <path d="M6.6 11h6.2M6.6 14h4.2" />
  </Icon>
);

/** Sign. A pen nib. */
export const IconPenNib = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.6 16.4 7 9.2l5.4-5.4 3.8 3.8L10.8 13z" />
    <path d="M7 9.2l3.8 3.8" />
    <path d="M9.2 14.8 6.4 17.6" />
  </Icon>
);

/** Signed and locked. */
export const IconLockSmall = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.4" y="8.6" width="11.2" height="8.4" rx="1.6" />
    <path d="M7.2 8.6V6.4a2.8 2.8 0 0 1 5.6 0v2.2" />
  </Icon>
);

/** Source trace: two links across a gutter. */
export const IconLinkSpan = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8.2 12.4 6 14.6a2.8 2.8 0 0 1-4-4l2.6-2.6a2.8 2.8 0 0 1 4 0" />
    <path d="M11.8 7.6 14 5.4a2.8 2.8 0 0 1 4 4l-2.6 2.6a2.8 2.8 0 0 1-4 0" />
  </Icon>
);

/** The between-sessions clock. */
export const IconClockRound = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7.2" />
    <path d="M10 5.8V10l3 1.8" />
  </Icon>
);

/** Trust and audit. */
export const IconShieldLine = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 2.4 16 4.6v4.6c0 3.6-2.4 6.6-6 8-3.6-1.4-6-4.4-6-8V4.6z" />
    <path d="M7.2 8.6h5.6M7.2 11.4h3.4" />
  </Icon>
);

/** One audit event. */
export const IconEyeLog = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.6 10s2.8-4.6 7.4-4.6S17.4 10 17.4 10s-2.8 4.6-7.4 4.6S2.6 10 2.6 10z" />
    <circle cx="10" cy="10" r="2.1" />
  </Icon>
);

/** Purge. A flame going out — deletion is shown proudly. */
export const IconFlameOut = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 2.8c2.6 2.4 4.4 4.4 4.4 7a4.4 4.4 0 0 1-8.8 0c0-1.3.5-2.4 1.4-3.6" />
    <path d="M3.6 16.6h12.8" />
  </Icon>
);

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.4v9.2" />
    <path d="M6.4 9.2 10 12.8l3.6-3.6" />
    <path d="M3.6 16.6h12.8" />
  </Icon>
);

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 5.6 12.4 10 8 14.4" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4.6v10.8M4.6 10h10.8" />
  </Icon>
);

/** Capture: plus in a circle (tab bar). */
export const IconPlusCircle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7.2" />
    <path d="M10 6.6v6.8M6.6 10h6.8" />
  </Icon>
);

export const IconGear = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2.6v1.9M10 15.5v1.9M3.9 10H2M18 10h-1.9M5.7 5.7 4.4 4.4M15.6 15.6l-1.3-1.3M14.3 5.7l1.3-1.3M4.4 15.6l1.3-1.3" />
  </Icon>
);

export const IconPeople = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7.4" cy="7.6" r="2.6" />
    <path d="M3 16.4c0-2.4 2-4 4.4-4s4.4 1.6 4.4 4" />
    <path d="M13.2 5.6a2.4 2.4 0 0 1 0 4.6M14 12.8c1.8.4 3 1.8 3 3.6" />
  </Icon>
);

/** The brand mark: the one place sage is allowed to be a shape. */
export function IconMark({ size = 20 }: { size?: number }) {
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
      style={{ flex: "none" }}
    >
      <path d="M4 16.2c1.8-1.6 3-4.4 4.6-8.2C9.6 5.6 10.6 4 11.8 4c1.4 0 1.8 1.6 1 3.6-.8 2-2 3.2-2 4.4 0 .9.7 1.4 1.7 1.4 1.2 0 2.2-.6 3.5-1.8" />
      <path d="M3.2 18.2h13.6" />
    </svg>
  );
}
