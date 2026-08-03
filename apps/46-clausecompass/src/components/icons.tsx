/**
 * src/components/icons.tsx
 *
 * The icon set: one family, 20×20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor`. DESIGN.md's iconography rule and DESIGN_LANGUAGE rule 1's
 * replacement for emoji. Nav renders at 22px, inline at 18px.
 *
 * Every glyph DESIGN.md names is here and nothing else is.
 */

import type { SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  size?: number;
}

function Icon({ size = 20, children, style, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      // `flex: none` by default: an icon inside a flex row is otherwise shrinkable,
      // and a long clause title beside it squeezes it to a smudge.
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

/** The brand mark: a compass needle. The one place oxblood is a shape. */
export const IconCompass = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7.4" />
    <path d="M12.6 7.4 8.9 8.9 7.4 12.6l3.7-1.5z" />
  </Icon>
);

export const IconUploadDoc = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11.2 2.6H5.6a1.2 1.2 0 0 0-1.2 1.2v12.4a1.2 1.2 0 0 0 1.2 1.2h8.8a1.2 1.2 0 0 0 1.2-1.2V6.9z" />
    <path d="M11.2 2.6v3.1a1.2 1.2 0 0 0 1.2 1.2h3.2" />
    <path d="M10 14v-4.4M8.2 11.2 10 9.4l1.8 1.8" />
  </Icon>
);

/** Clauses: brackets around a line of text. */
export const IconClauseBrackets = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.6 3.6H4.4v12.8h2.2M13.4 3.6h2.2v12.8h-2.2" />
    <path d="M8.4 8.2h3.2M8.4 11.4h3.2" />
  </Icon>
);

export const IconFlagSmall = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.4 17V3.4" />
    <path d="M5.4 4.2h8.2l-1.5 3.2 1.5 3.2H5.4z" />
  </Icon>
);

/** Redlines: a pen striking through a line. */
export const IconStrikePen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.4 10h13.2" />
    <path d="M13.2 4.4l2.4 2.4-6.1 6.1-2.4-2.4z" />
    <path d="M7.1 10.5 6 15l4.4-1.1" />
  </Icon>
);

export const IconQuoteMarks = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.4 4.6C5.3 5.9 4.2 7.8 4.2 10.3c0 2.1 1 3.5 2.6 3.5 1.4 0 2.4-1 2.4-2.4 0-1.3-.9-2.2-2.1-2.2-.2 0-.4 0-.6.1.2-1.3 1-2.4 2.3-3.2z" />
    <path d="M15.4 4.6c-2.1 1.3-3.2 3.2-3.2 5.7 0 2.1 1 3.5 2.6 3.5 1.4 0 2.4-1 2.4-2.4 0-1.3-.9-2.2-2.1-2.2-.2 0-.4 0-.6.1.2-1.3 1-2.4 2.3-3.2z" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.2 10.6l3.4 3.4 8.2-8.2" />
  </Icon>
);

export const IconAlertTriangle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.4 17.2 16H2.8z" />
    <path d="M10 7.8v3.6M10 13.8h.01" />
  </Icon>
);

/** Missing clause: a magnifier over nothing. */
export const IconSearchMissing = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="5.2" />
    <path d="M12.9 12.9 17 17" />
    <path d="M7 9h4" />
  </Icon>
);

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.4v9.2M6.4 9.2 10 12.8l3.6-3.6" />
    <path d="M3.6 15.8h12.8" />
  </Icon>
);

export const IconMailDraft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.2 5.4h13.6v9.2H3.2z" />
    <path d="m3.2 6 6.8 4.6L16.8 6" />
  </Icon>
);

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 5.2 12.8 10 8 14.8" />
  </Icon>
);

export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.2 8 10 12.8 14.8 8" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4.2v11.6M4.2 10h11.6" />
  </Icon>
);

/** "Worth a real lawyer": a gavel pointing out of the product. */
export const IconGavelOut = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4.2 12.6 4.2-4.2 2.8 2.8-4.2 4.2z" />
    <path d="m9.8 4.6 4.2 4.2M12.6 3.4 16.6 7.4" />
    <path d="M11.4 16.6h5.2" />
  </Icon>
);

/**
 * Settings. Drawn as a toothed ring rather than a circle with radiating ticks — the ticks
 * version reads as a sun in a screenshot, which was the first thing a rendered screen
 * showed that reading the CSS never would.
 */
export const IconGear = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="2.4" />
    <path d="M8.9 2.6h2.2l.35 1.9 1.55.9 1.8-.75 1.1 1.9-1.45 1.3v1.8l1.45 1.3-1.1 1.9-1.8-.75-1.55.9-.35 1.9H8.9l-.35-1.9-1.55-.9-1.8.75-1.1-1.9L5.55 10.5V8.7L4.1 7.4l1.1-1.9 1.8.75 1.55-.9z" />
  </Icon>
);

export const IconCopy = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.4 7.4h8.2v8.2H7.4z" />
    <path d="M12.6 7.4V4.4H4.4v8.2h3" />
  </Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.8 5.8h12.4M8.2 5.8V4.2h3.6v1.6" />
    <path d="M5.4 5.8 6 16h8l.6-10.2" />
  </Icon>
);
