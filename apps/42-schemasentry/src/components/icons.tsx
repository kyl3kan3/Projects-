/**
 * The icon set. One family, 20×20 viewBox, 1.75px stroke, round caps and
 * joins, `currentColor` — DESIGN.md's iconography rule. Nav renders at 22px,
 * inline at 18px.
 *
 * There are no emoji anywhere in this product, including Slack messages and PR
 * comments. Every glyph DESIGN.md lists is here and nothing else is, so a
 * screen cannot reach for something off-system.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
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

/** Deploy timeline: a vertical rule with event ticks. */
export const IconTimeline = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3v14" />
    <path d="M5 6.5h5.5" />
    <path d="M5 10h8" />
    <path d="M5 13.5h4" />
  </Svg>
);

/** Diff: two offset brackets. */
export const IconDiff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3.5H5.5A1.5 1.5 0 0 0 4 5v10a1.5 1.5 0 0 0 1.5 1.5H8" />
    <path d="M12 3.5h2.5A1.5 1.5 0 0 1 16 5v10a1.5 1.5 0 0 1-1.5 1.5H12" />
  </Svg>
);

/** Consumers: three nodes on a line. */
export const IconConsumers = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10h14" />
    <circle cx="4.5" cy="10" r="1.6" />
    <circle cx="10" cy="10" r="1.6" />
    <circle cx="15.5" cy="10" r="1.6" />
  </Svg>
);

/** Changelog: a scroll. */
export const IconScroll = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 3.5h9v13h-9z" />
    <path d="M8 7h4M8 10h4M8 13h2.5" />
  </Svg>
);

export const IconShieldCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 2.5 4.5 4.6v4.6c0 3.4 2.3 6.4 5.5 7.3 3.2-.9 5.5-3.9 5.5-7.3V4.6z" />
    <path d="M7.6 9.8l1.8 1.8 3.2-3.4" />
  </Svg>
);

export const IconShieldX = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 2.5 4.5 4.6v4.6c0 3.4 2.3 6.4 5.5 7.3 3.2-.9 5.5-3.9 5.5-7.3V4.6z" />
    <path d="M8 8l4 4M12 8l-4 4" />
  </Svg>
);

/** JSON pointer: hash plus arrow. */
export const IconPointer = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7.5h6M3.5 12h6" />
    <path d="M7 4l-1.5 12" />
    <path d="M11 4l-1 6" />
    <path d="M12 14h4m0 0-1.8-1.8M16 14l-1.8 1.8" />
  </Svg>
);

/** Acknowledge: a check inside a speech outline. */
export const IconAck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16.5 10.5c0 2.8-2.9 5-6.5 5-.8 0-1.6-.1-2.3-.3L4 16.5l1.1-2.6A5.1 5.1 0 0 1 3.5 10.5c0-2.8 2.9-5 6.5-5s6.5 2.2 6.5 5z" />
    <path d="M7.8 10.2l1.6 1.6 3-3.2" />
  </Svg>
);

/** Slack channel: a hash. */
export const IconSlackHash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7.5h12M4 12.5h12" />
    <path d="M8.5 3.5 7 16.5M13.5 3.5 12 16.5" />
  </Svg>
);

export const IconBranch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="5" r="1.8" />
    <circle cx="6" cy="15" r="1.8" />
    <circle cx="14" cy="8" r="1.8" />
    <path d="M6 6.8v6.4" />
    <path d="M14 9.8c0 2.4-2 3.4-4 3.6" />
  </Svg>
);

export const IconTag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.6 3.5H16v5.4l-6.7 6.7a1.4 1.4 0 0 1-2 0l-3.4-3.4a1.4 1.4 0 0 1 0-2z" />
    <circle cx="13" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7" y="7" width="9" height="9" rx="1.6" />
    <path d="M13 4.5H5.6A1.1 1.1 0 0 0 4.5 5.6V13" />
  </Svg>
);

export const IconRss = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 8.5A7 7 0 0 1 11.5 15.5" />
    <path d="M4.5 4.5A11 11 0 0 1 15.5 15.5" />
    <circle cx="5" cy="15" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4.5v11M4.5 10h11" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5l5 5-5 5" />
  </Svg>
);

export const IconKey = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="3" />
    <path d="M9.2 9.2 16 16" />
    <path d="M13 13l-1.6 1.6M15 15l-1.6 1.6" />
  </Svg>
);

/** The brand mark: a bracket pair with a break-red strike through it. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.5 3.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h2.5" />
        <path d="M12.5 3.5H15A1.5 1.5 0 0 1 16.5 5v10a1.5 1.5 0 0 1-1.5 1.5h-2.5" />
      </g>
      <path d="M5.5 10h9" stroke="var(--color-break)" strokeWidth={1.75} strokeLinecap="round" />
    </svg>
  );
}
