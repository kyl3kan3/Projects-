/**
 * One icon set: 20×20 viewBox, 1.75px stroke, round caps and joins. Nav icons
 * render at 22px. No emoji anywhere in this product (DESIGN_LANGUAGE rule 1).
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

/** The brand mark: a folder tab with the one ruled line through it. */
export function IconFile(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.6 5.2h5l1.4 1.8h8.4v8.4a1.2 1.2 0 0 1-1.2 1.2H3.8a1.2 1.2 0 0 1-1.2-1.2z" />
      <path d="M2.6 11.4h14.8" />
    </Svg>
  );
}

/** The pipeline: stacked deal lines. */
export function IconLines(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.6 5.4h14.8M2.6 10h14.8M2.6 14.6h14.8" />
      <path d="M6.4 3.9v3M12.2 8.5v3M8.6 13.1v3" />
    </Svg>
  );
}

/** A checklist template. */
export function IconChecklist(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7.4 5.4h9M7.4 10h9M7.4 14.6h9" />
      <path d="M3 5.2l1.2 1.2L6 4.4M3 13.8l1.2 1.2L6 13" />
      <path d="M3.2 10h1.6" />
    </Svg>
  );
}

/** Commission: a ledger column. */
export function IconLedger(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.4 3.2h13.2v13.6H3.4z" />
      <path d="M3.4 7.2h13.2M11.2 7.2v9.6" />
      <path d="M5.6 10.4h3.4M5.6 13.2h3.4" />
    </Svg>
  );
}

/** Settings: a filing drawer with its pull. */
export function IconDrawer(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 4.2h14v5.2H3zM3 10.6h14v5.2H3z" />
      <path d="M8.4 6.8h3.2M8.4 13.2h3.2" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.2 10.6l3.4 3.4 8.2-8.6" />
    </Svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="7.4" />
      <path d="M10 5.8V10l3 1.8" />
    </Svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3.4l7 12.2H3z" />
      <path d="M10 8v3.2M10 13.4v.1" />
    </Svg>
  );
}

export function IconMail(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.8 5.4h14.4v9.2H2.8z" />
      <path d="M2.8 5.9l7.2 5 7.2-5" />
    </Svg>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 14.2V4.6" />
      <path d="M6.2 8.2L10 4.4l3.8 3.8" />
      <path d="M3.6 15.6h12.8" />
    </Svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4.4v9.6" />
      <path d="M6.2 10.2L10 14l3.8-3.8" />
      <path d="M3.6 16.4h12.8" />
    </Svg>
  );
}

export function IconLink(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8.2 11.8a3 3 0 0 1 0-4.2l2-2a3 3 0 0 1 4.2 4.2l-1 1" />
      <path d="M11.8 8.2a3 3 0 0 1 0 4.2l-2 2a3 3 0 0 1-4.2-4.2l1-1" />
    </Svg>
  );
}

export function IconPerson(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="7" r="3" />
      <path d="M4 16.4c0-2.7 2.7-4.4 6-4.4s6 1.7 6 4.4" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4.4v11.2M4.4 10h11.2" />
    </Svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10h12" />
      <path d="M11.6 5.8L15.8 10l-4.2 4.2" />
    </Svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.4 5.6h13.2v11H3.4z" />
      <path d="M3.4 9h13.2M7 3.4v3.2M13 3.4v3.2" />
    </Svg>
  );
}

export function IconNote(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 3.4h9.2L16.4 6.6v10H4z" />
      <path d="M7 9h6.4M7 12.2h4.4" />
    </Svg>
  );
}
