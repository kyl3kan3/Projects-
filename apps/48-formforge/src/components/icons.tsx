/**
 * src/components/icons.tsx
 *
 * The icon set. One family, 20×20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor` — DESIGN.md's iconography rule, and DESIGN_LANGUAGE rule 1's
 * replacement for emoji. Nav renders at 22px, inline at 18px.
 *
 * Every glyph DESIGN.md names is here and nothing else is; a screen that wants a
 * new mark adds it to this file rather than reaching for a library.
 */

import type { SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  size?: number;
}

function Icon({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
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
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Intakes. */
export const IconInboxTray = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12.5h4l1.2 2h4.6l1.2-2h4" />
    <path d="M4 12.5 5.8 4h8.4L16 12.5v3.2a.8.8 0 0 1-.8.8H4.8a.8.8 0 0 1-.8-.8z" />
  </Icon>
);

/** Builder: three stacked rects. */
export const IconBlocks = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="14" height="3.6" rx="1" />
    <rect x="3" y="8.2" width="14" height="3.6" rx="1" />
    <rect x="3" y="13.4" width="14" height="3.6" rx="1" />
  </Icon>
);

/** Patients: two heads. */
export const IconPatients = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7.6" cy="6.6" r="2.6" />
    <path d="M2.8 16.4c0-2.4 2.1-4.1 4.8-4.1s4.8 1.7 4.8 4.1" />
    <path d="M13.2 4.4a2.6 2.6 0 0 1 0 4.9" />
    <path d="M14.4 12.6c1.7.4 2.8 1.8 2.8 3.8" />
  </Icon>
);

/** Audit: a ruled page. */
export const IconLedger = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 2.5h11v15h-11z" />
    <path d="M7.2 6.2h5.6M7.2 9.4h5.6M7.2 12.6h3.4" />
  </Icon>
);

export const IconGear = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2.5v2M10 15.5v2M3.7 6.3l1.7 1M14.6 12.7l1.7 1M3.7 13.7l1.7-1M14.6 7.3l1.7-1" />
  </Icon>
);

/** Signature: pen nib over a line. */
export const IconSignature = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 16.5h14" />
    <path d="M5.4 13.2 13 5.6a1.7 1.7 0 0 1 2.4 2.4l-7.6 7.6-3.2.6z" />
  </Icon>
);

export const IconShieldCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 2.4 16 4.6v4.6c0 3.6-2.4 6.6-6 8-3.6-1.4-6-4.4-6-8V4.6z" />
    <path d="M7.4 9.8 9.4 12l3.4-4" />
  </Icon>
);

export const IconBell = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 8.6a4 4 0 0 1 8 0c0 3.2 1.2 4.6 1.6 5H4.4c.4-.4 1.6-1.8 1.6-5z" />
    <path d="M8.4 16.6a1.8 1.8 0 0 0 3.2 0" />
  </Icon>
);

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3v9" />
    <path d="M6.4 8.6 10 12.2l3.6-3.6" />
    <path d="M3.6 15.4h12.8" />
  </Icon>
);

export const IconSend = (p: IconProps) => (
  <Icon {...p}>
    <path d="M17 3 8.6 11.4" />
    <path d="M17 3l-5.4 14-3-6.6L2 7.4z" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10.6 8 14.6 16 5.6" />
  </Icon>
);

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.6 4.4 13.2 10l-5.6 5.6" />
  </Icon>
);

export const IconChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.4 4.4 6.8 10l5.6 5.6" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4v12M4 10h12" />
  </Icon>
);

export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 6v4.3l2.8 1.7" />
  </Icon>
);

export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.2" y="8.6" width="11.6" height="8.4" rx="1.4" />
    <path d="M7 8.6V6.4a3 3 0 0 1 6 0v2.2" />
  </Icon>
);

export const IconAlert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.4 17.2 16H2.8z" />
    <path d="M10 8v3.6M10 13.8v.6" />
  </Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.6 5.8h12.8" />
    <path d="M5.6 5.8 6.4 17h7.2l.8-11.2" />
    <path d="M7.8 5.8V3.6h4.4v2.2" />
  </Icon>
);

export const IconArrowUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 16V4" />
    <path d="M5.6 8.4 10 4l4.4 4.4" />
  </Icon>
);

export const IconArrowDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4v12" />
    <path d="M5.6 11.6 10 16l4.4-4.4" />
  </Icon>
);

export const IconFile = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 2.6h6l4 4V17.4H5z" />
    <path d="M11 2.6v4h4" />
  </Icon>
);
