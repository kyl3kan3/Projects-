/**
 * The icon set. One family: 20×20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor`. Nav renders at 22px, inline at 18px.
 *
 * DESIGN.md names the required glyphs: pulse, flare, rocket-pennant, broom,
 * chevron-down, check, magnifier, bell, plug, slack-hash, clock. The handful of
 * extras below (gear, plus, alert, target, external, x) are drawn to the same
 * spec — there is no second icon family in this product and no emoji anywhere.
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

/** Spend — a pulse trace. */
export const IconPulse = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 12h3l2.2-6 2.6 11L12.4 8l1.4 4H18" />
  </Icon>
);

/** Anomalies — a flare: a dot with four short rays. */
export const IconFlare = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2.5v2.4M10 15.1v2.4M2.5 10h2.4M15.1 10h2.4" />
  </Icon>
);

/** Deploys — a pennant on a mast. */
export const IconPennant = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 2.5v15" />
    <path d="M5.5 3.6h9.2l-2.4 3.1 2.4 3.1H5.5" />
  </Icon>
);

/** Waste — a broom. */
export const IconBroom = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16.5 3.5 9.8 10.2" />
    <path d="M4 17.2c1.3-3.6 2.6-5.4 4.2-5.9 1.5-.4 2.7.4 3.5 1.6.8 1.2.9 2.6.2 3.6-.8 1-2.4 1.2-4.2 1-1.3-.1-2.5-.2-3.7-.3Z" />
    <path d="M7.6 12.4 5.2 15" />
  </Icon>
);

export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 8l5 5 5-5" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10.6 8 14.5 16 5.5" />
  </Icon>
);

/** Investigate — a magnifier. */
export const IconMagnifier = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8.8" cy="8.8" r="5.3" />
    <path d="M12.8 12.8 17 17" />
  </Icon>
);

export const IconBell = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 8.5a4 4 0 0 1 8 0c0 3 .8 4.4 1.5 5.2H4.5C5.2 12.9 6 11.5 6 8.5Z" />
    <path d="M8.4 16.4a1.8 1.8 0 0 0 3.2 0" />
  </Icon>
);

/** Add account — a plug. */
export const IconPlug = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 2.5v3.4M12.5 2.5v3.4" />
    <path d="M5.4 6h9.2v2.6a4.6 4.6 0 0 1-9.2 0V6Z" />
    <path d="M10 13.2v4.3" />
  </Icon>
);

/** Slack channel — a hash. */
export const IconHash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.6 2.8 6.2 17.2M13.8 2.8l-1.4 14.4M3.2 7.2h13.6M2.6 12.8h13.6" />
  </Icon>
);

export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7.2" />
    <path d="M10 5.8V10l3 1.9" />
  </Icon>
);

/** Settings — a gear: a toothed ring, not a sun. */
export const IconGear = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="2.7" />
    <path d="M8.7 2.5h2.6l.35 1.9 1.6.93 1.8-.72 1.3 2.25-1.45 1.28v1.86l1.45 1.28-1.3 2.25-1.8-.72-1.6.93-.35 1.87H8.7l-.35-1.87-1.6-.93-1.8.72-1.3-2.25L5.1 11.5V9.64L3.65 8.36l1.3-2.25 1.8.72 1.6-.93z" />
  </Icon>
);

export const IconAlert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.2 17.4 16H2.6L10 3.2Z" />
    <path d="M10 8v3.4M10 13.8h.01" />
  </Icon>
);

/** Budgets — a target ring. */
export const IconTarget = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7.2" />
    <circle cx="10" cy="10" r="3" />
  </Icon>
);

export const IconExternal = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11 3.5h5.5V9" />
    <path d="M16.5 3.5 9 11" />
    <path d="M14 12.5v3a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 5 6.5h3" />
  </Icon>
);

export const IconX = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 5l10 10M15 5 5 15" />
  </Icon>
);

export const IconArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 10H4" />
    <path d="M9 5l-5 5 5 5" />
  </Icon>
);
