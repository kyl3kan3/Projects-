/**
 * The icon set: one family, 20×20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor`. Nav renders at 22px, inline at 18px.
 *
 * No emoji anywhere in this product — a paid deposit gets `card` and a hi-vis
 * figure, not a money bag (DESIGN.md, iconography).
 */

import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function Icon({ size = 18, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
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
      {...props}
    />
  );
}

/** Record. */
export const IconMic = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7.5" y="2" width="5" height="9.5" rx="2.5" />
    <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v3M7 18h6" />
  </Icon>
);

/** Stop. */
export const IconSquare = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="5" width="10" height="10" rx="1.5" />
  </Icon>
);

export const IconPause = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 4v12M12.5 4v12" />
  </Icon>
);

export const IconCamera = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6.5h2.8l1.2-2h6l1.2 2H17a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" />
    <circle cx="10" cy="11" r="2.8" />
  </Icon>
);

/** Price book. */
export const IconBook = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 4.5A1.5 1.5 0 0 1 5 3h11v14H5a1.5 1.5 0 0 1-1.5-1.5v-11Z" />
    <path d="M3.5 14.5A1.5 1.5 0 0 1 5 13h11M7 6.5h6" />
  </Icon>
);

/** Line items / jobs list. */
export const IconRows = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 5.5h15M2.5 10h15M2.5 14.5h15" />
  </Icon>
);

export const IconSend = (p: IconProps) => (
  <Icon {...p}>
    <path d="M17.5 2.5 8.8 11.2M17.5 2.5 12 17.5l-3.2-6.3L2.5 8z" />
  </Icon>
);

/** Accepted — a signature stroke. */
export const IconSignature = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 13.5c2.2 0 3.2-8 5-8s.4 8 2.4 8c1.6 0 2-4 3.6-4 1.2 0 1.2 4 4 4" />
    <path d="M2.5 17h15" />
  </Icon>
);

/** Deposit. */
export const IconCard = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="4.5" width="16" height="11" rx="1.5" />
    <path d="M2 8.5h16M5 12.5h3" />
  </Icon>
);

export const IconPencil = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.5 3.5 16.5 6.5 7 16H4v-3z" />
    <path d="M12 5 15 8" />
  </Icon>
);

/** Needs pricing. */
export const IconFlag = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 2.5v15M5 3.5h9l-1.6 3.5L14 10.5H5" />
  </Icon>
);

/** Follow-up. */
export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 5.5V10l3 2" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 10.5 8 15l8.5-9.5" />
  </Icon>
);

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 4l6 6-6 6" />
  </Icon>
);

export const IconChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.5 4l-6 6 6 6" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4v12M4 10h12" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />
  </Icon>
);

export const IconAlert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 2.8 18 16.5H2z" />
    <path d="M10 7.8v4M10 14.2h.01" />
  </Icon>
);

export const IconGear = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6h5M12 6h5M3 14h9M16 14h1" />
    <circle cx="10" cy="6" r="2" />
    <circle cx="14" cy="14" r="2" />
  </Icon>
);

export const IconUpload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 13V2.5M6.5 6 10 2.5 13.5 6M3 16.5h14" />
  </Icon>
);

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 2.5v10M6.5 9 10 12.5 13.5 9M3 16.5h14" />
  </Icon>
);

export const IconEye = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.8 10S4.8 4.8 10 4.8 18.2 10 18.2 10 15.2 15.2 10 15.2 1.8 10 1.8 10Z" />
    <circle cx="10" cy="10" r="2.4" />
  </Icon>
);

export const IconRefresh = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16.5 6.5A7.5 7.5 0 1 0 17 12" />
    <path d="M17.5 2.5v4.2h-4.2" />
  </Icon>
);

export const IconTranscript = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 4.5h14M3 8h9M3 11.5h11M3 15h6" />
  </Icon>
);
