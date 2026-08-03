/**
 * One icon set: 20×20 viewBox, 1.75px stroke, round caps and joins. Nav icons are
 * rendered at 22px. No emoji anywhere in this product (DESIGN_LANGUAGE rule 1).
 */

interface IconProps {
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
      className={className}
      style={{ flex: "none" }}
    >
      {children}
    </svg>
  );
}

/** The brand mark: a shield over a filed sheet. */
export function IconShield(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 2.3 16.2 4.6v4.7c0 3.7-2.5 6.7-6.2 8.4-3.7-1.7-6.2-4.7-6.2-8.4V4.6z" />
      <path d="M7.4 8.6h5.2M7.4 11.4h3.2" />
    </Svg>
  );
}

/** The compliance seal: a ring with a short inner tick. The one gold shape. */
export function IconSeal({ size = 20, className }: IconProps) {
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
      style={{ flex: "none" }}
    >
      <circle cx="10" cy="10" r="7.6" />
      <path d="M6.9 10.2l2.1 2.1 4.1-4.3" />
    </svg>
  );
}

export function IconGauge(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.2 15.2a8 8 0 1 1 13.6 0" />
      <path d="M10 10.6 13 7.4" />
      <circle cx="10" cy="15.2" r="1.1" />
    </Svg>
  );
}

export function IconVendors(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7.4" cy="7.2" r="2.6" />
      <path d="M2.8 16.4c0-2.5 2.1-4.3 4.6-4.3s4.6 1.8 4.6 4.3" />
      <path d="M13.4 5.4a2.4 2.4 0 0 1 0 4.6M14.6 12.4c1.6.5 2.6 1.9 2.6 4" />
    </Svg>
  );
}

export function IconBuilding(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.4 17.2V4.4a1 1 0 0 1 1-1h6.4a1 1 0 0 1 1 1v12.8" />
      <path d="M11.8 8.4h3.8a1 1 0 0 1 1 1v7.8" />
      <path d="M2.2 17.2h15.6M6 6.6h3M6 9.8h3M6 13h3M14 11.6h.8M14 14.4h.8" />
    </Svg>
  );
}

export function IconReview(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.4 2.8h7l4.2 4.2v10.2H4.4z" />
      <path d="M11.2 2.8V7h4.4" />
      <path d="M7 11.4h6M7 14.2h3.6" />
    </Svg>
  );
}

export function IconRequirements(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.4 3.4h7.2a1 1 0 0 1 1 1v12.2H5.4V4.4a1 1 0 0 1 1-1z" />
      <path d="M8 7.2h4M8 10.2h4M8 13.2h2.4" />
      <path d="M4 6.2h1.4M4 10.2h1.4M4 14.2h1.4" />
    </Svg>
  );
}

/** Settings: sliders, not a cog. A cog at 20px with a 1.75px stroke reads as a sun. */
export function IconGear(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6.2h9.2M15.4 6.2h1.6M3 13.8h4.6M10.8 13.8H17" />
      <circle cx="13.8" cy="6.2" r="1.9" />
      <circle cx="9" cy="13.8" r="1.9" />
    </Svg>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 13.4V3.6" />
      <path d="M6.4 7.2 10 3.6l3.6 3.6" />
      <path d="M3.4 12.6v2.8a1 1 0 0 0 1 1h11.2a1 1 0 0 0 1-1v-2.8" />
    </Svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3.6v9.8" />
      <path d="M6.4 9.8 10 13.4l3.6-3.6" />
      <path d="M3.4 12.6v2.8a1 1 0 0 0 1 1h11.2a1 1 0 0 0 1-1v-2.8" />
    </Svg>
  );
}

export function IconLink(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8.2 11.8 11.8 8.2" />
      <path d="M7 13.6 5.8 14.8a2.6 2.6 0 0 1-3.6-3.6l2.4-2.4a2.6 2.6 0 0 1 3.6 0" />
      <path d="M13 6.4l1.2-1.2a2.6 2.6 0 0 1 3.6 3.6l-2.4 2.4a2.6 2.6 0 0 1-3.6 0" />
    </Svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 5.8V10l2.8 1.8" />
    </Svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3.2 17.4 16H2.6z" />
      <path d="M10 8v3.4M10 13.6h.01" />
    </Svg>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7.8 4.6 13.2 10l-5.4 5.4" />
    </Svg>
  );
}

export function IconMail(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.8 5.4h14.4v9.2H2.8z" />
      <path d="m2.8 5.4 7.2 5 7.2-5" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4v12M4 10h12" />
    </Svg>
  );
}

export function IconLedger(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.6 3.6h12.8v12.8H3.6z" />
      <path d="M3.6 7.6h12.8M3.6 11.6h12.8M8 3.6v12.8" />
    </Svg>
  );
}
