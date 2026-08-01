/**
 * The icon set. One family, 20×20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor`. Nav renders at 22px, inline at 18px.
 *
 * No emoji anywhere in this product — a landed payment gets `banknote-in`, not
 * confetti (DESIGN.md, iconography).
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

/** Aging — a pair of scales. */
export const IconScales = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3v13M6 16h8M3 7h14M10 4.5 3 7l2 4h-4l2-4M10 4.5 17 7l-2 4h4l-2-4" />
  </Icon>
);

/** Awaiting — an hourglass. */
export const IconHourglass = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 2.5h8M6 17.5h8M7 2.5v3.2c0 1 .5 1.9 1.3 2.4L10 9.2l1.7-1.1A3 3 0 0 0 13 5.7V2.5M7 17.5v-3.2c0-1 .5-1.9 1.3-2.4L10 10.8l1.7 1.1a3 3 0 0 1 1.3 2.4v3.2" />
  </Icon>
);

/** Sequence — a paper plane. */
export const IconSend = (p: IconProps) => (
  <Icon {...p}>
    <path d="M17.5 2.5 8.8 11.2M17.5 2.5 12 17.5l-3.2-6.3L2.5 8z" />
  </Icon>
);

/** Promise — a handshake. */
export const IconHandshake = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 8.5 5 6h3l2 2 2-2h3l2.5 2.5M10 8v4M2.5 8.5v3l3 3 2-2M17.5 8.5v3l-3 3-2-2" />
  </Icon>
);

/** Payment in — a banknote with an arrow. */
export const IconBanknoteIn = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="7" width="15" height="9" rx="1.5" />
    <circle cx="10" cy="11.5" r="1.8" />
    <path d="M10 5V1.5M10 5 8 3M10 5l2-2" />
  </Icon>
);

export const IconCalendarCheck = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="4" width="15" height="13.5" rx="1.5" />
    <path d="M2.5 8h15M6.5 2v3M13.5 2v3M7 12.5l2 2 4-4" />
  </Icon>
);

export const IconMail = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="4.5" width="16" height="11" rx="1.5" />
    <path d="m2.8 5.5 6.3 4.7a1.5 1.5 0 0 0 1.8 0l6.3-4.7" />
  </Icon>
);

export const IconReply = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4.5 2.5 9 7 13.5M2.5 9h8a6 6 0 0 1 6 6v1.5" />
  </Icon>
);

export const IconPause = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 3.5v13M12.5 3.5v13" />
  </Icon>
);

export const IconPlay = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 3.2v13.6L16.5 10z" />
  </Icon>
);

export const IconGear = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6h5M12 6h5M3 14h9M16 14h1" />
    <circle cx="10" cy="6" r="2" />
    <circle cx="14" cy="14" r="2" />
  </Icon>
);

/** Forecast — weekly columns. */
export const IconChartForecast = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 17h15M5 17v-4.5M9 17V8M13 17v-6.5M17 17V5" />
  </Icon>
);

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 2.5v10M6.5 9 10 12.5 13.5 9M3 16.5h14" />
  </Icon>
);

export const IconUpload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 13V2.5M6.5 6 10 2.5 13.5 6M3 16.5h14" />
  </Icon>
);

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 4l6 6-6 6" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4v12M4 10h12" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 10.5 8 15l8.5-9.5" />
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

export const IconLink = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 12l4-4M7.5 5.5 9 4a3.5 3.5 0 0 1 5 5l-1.5 1.5M12.5 14.5 11 16a3.5 3.5 0 0 1-5-5l1.5-1.5" />
  </Icon>
);

export const IconUsers = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7.5" cy="7" r="2.8" />
    <path d="M2.5 17c0-2.6 2.2-4.5 5-4.5s5 1.9 5 4.5M13.5 5.2a2.8 2.8 0 0 1 0 5.4M14.5 12.9c1.9.5 3 2.1 3 4.1" />
  </Icon>
);

export const IconBuilding = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 17.5V4.5A1 1 0 0 1 4.5 3.5h7a1 1 0 0 1 1 1v13M12.5 8.5h3a1 1 0 0 1 1 1v8M2 17.5h16M6 6.5h3M6 9.5h3M6 12.5h3" />
  </Icon>
);
