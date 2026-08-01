/**
 * The icon set. One family, 20×20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor` — DESIGN.md's glyph list and nothing beyond it. Nav renders at 22,
 * inline at 18.
 *
 * There are no emoji anywhere in this product. An award gets `trophy-flat`, a flat
 * pennant, not a party popper.
 */

export interface IconProps {
  size?: number;
  className?: string;
  title?: string;
}

function base(size = 18, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: `glyph${className ? ` ${className}` : ""}`,
    "aria-hidden": true,
    focusable: false,
  };
}

/** Leveling: three columns snapping into alignment. */
export function IconColumns({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 3.5h14v13H3z" />
      <path d="M8 3.5v13M13 3.5v13M3 8h14" />
    </svg>
  );
}

/** Subs: a hard hat. */
export function IconHardHat({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 13a7 7 0 0 1 14 0" />
      <path d="M8 6.4V4.2A1.2 1.2 0 0 1 9.2 3h1.6A1.2 1.2 0 0 1 12 4.2v2.2" />
      <path d="M2 13.2h16" />
      <path d="M2 16h16" />
    </svg>
  );
}

/** Projects and plans: a folded blueprint. */
export function IconBlueprint({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 4.5 7 3l6 2 4-1.5v13L13 18l-6-2-4 1.5z" />
      <path d="M7 3v13M13 5v13" />
    </svg>
  );
}

export function IconGear({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
    </svg>
  );
}

export function IconSend({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M17 3 8.6 11.4" />
      <path d="M17 3l-5.2 14-3.2-5.6L3 8.2z" />
    </svg>
  );
}

export function IconBellRing({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 8.6a4 4 0 0 1 8 0c0 3.4 1.2 4.6 1.2 4.6H4.8S6 12 6 8.6Z" />
      <path d="M8.4 15.6a1.8 1.8 0 0 0 3.2 0" />
      <path d="M2.6 6.2A5.4 5.4 0 0 1 4.4 3M17.4 6.2A5.4 5.4 0 0 0 15.6 3" />
    </svg>
  );
}

/** Low bid: a narrow downward arrow. */
export function IconArrowDownNarrow({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M10 3.5v13" />
      <path d="M6.6 12.8 10 16.5l3.4-3.7" />
    </svg>
  );
}

/** Level: a balance. */
export function IconScale({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M10 3v13M5.5 16.5h9" />
      <path d="M3 7h14" />
      <path d="M3 7 1.5 11a2.6 2.6 0 0 0 3 0Z" />
      <path d="M17 7l1.5 4a2.6 2.6 0 0 1-3 0Z" />
    </svg>
  );
}

export function IconQuestion({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M8.1 7.9A1.9 1.9 0 0 1 11.9 8c0 1.3-1.9 1.5-1.9 3" />
      <path d="M10 14.1h.01" />
    </svg>
  );
}

/** Award: a flat pennant, per DESIGN.md — never a cup. */
export function IconTrophyFlat({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 3v14" />
      <path d="M5 3.6h10.5l-2.2 3.4 2.2 3.4H5z" />
    </svg>
  );
}

export function IconDownload({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M10 3v9" />
      <path d="M6.4 8.6 10 12.2l3.6-3.6" />
      <path d="M3.5 15.5h13" />
    </svg>
  );
}

export function IconLink({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M8.2 11.8 11.8 8.2" />
      <path d="M7.4 13.6 6 15a2.9 2.9 0 0 1-4.1-4.1l2.4-2.4a2.9 2.9 0 0 1 4.1 0" />
      <path d="M12.6 6.4 14 5a2.9 2.9 0 0 1 4.1 4.1l-2.4 2.4a2.9 2.9 0 0 1-4.1 0" />
    </svg>
  );
}

export function IconCheck({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 10.5 8 14.5 16 5.5" />
    </svg>
  );
}

export function IconXSmall({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 6l8 8M14 6l-8 8" />
    </svg>
  );
}

export function IconChevronRight({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M8 5l5 5-5 5" />
    </svg>
  );
}

export function IconPlus({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}
