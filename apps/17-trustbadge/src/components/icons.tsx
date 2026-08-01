/**
 * The icon set. One family, 20x20 viewBox, 1.75 stroke, round caps and joins,
 * currentColor — per DESIGN.md. Nav renders at 22px, inline at 16–18px.
 *
 * No emoji anywhere, ever: a five-star review is five drawn stars, and an
 * approval is a drawn check, not a thumbs-up glyph.
 */

export interface IconProps {
  size?: number;
  className?: string;
}

function svg(path: React.ReactNode, { size = 18, className }: IconProps) {
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
    >
      {path}
    </svg>
  );
}

/** The brand glyph, and the rating glyph. Shared with the widget renderer. */
export const STAR_PATH =
  "M10 2.4l2.35 4.76 5.25.77-3.8 3.7.9 5.23L10 14.39l-4.7 2.47.9-5.23-3.8-3.7 5.25-.77z";

export const IconStar = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className={className}>
    <path d={STAR_PATH} fill="currentColor" />
  </svg>
);

export const IconStarOutline = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className={className}>
    <path
      d={STAR_PATH}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinejoin="round"
    />
  </svg>
);

/** Verified buyer: a shield with a check. The one leaf-coloured mark. */
export const IconLeafCheck = (p: IconProps) =>
  svg(
    <>
      <path d="M10 2.5c2.6 1.6 4.4 4.3 4.4 7.3 0 3.3-2 6-4.4 7.7-2.4-1.7-4.4-4.4-4.4-7.7 0-3 1.8-5.7 4.4-7.3Z" />
      <path d="M7.6 10.1l1.8 1.8 3.2-3.6" />
    </>,
    p,
  );

export const IconCamera = (p: IconProps) =>
  svg(
    <>
      <path d="M2.5 7.5A1.6 1.6 0 0 1 4.1 5.9h1.6l1-1.6h4.6l1 1.6h1.6a1.6 1.6 0 0 1 1.6 1.6v6.4a1.6 1.6 0 0 1-1.6 1.6H4.1a1.6 1.6 0 0 1-1.6-1.6Z" />
      <circle cx="10" cy="10.6" r="2.6" />
    </>,
    p,
  );

export const IconMail = (p: IconProps) =>
  svg(
    <>
      <rect x="2.5" y="5" width="15" height="10" rx="1.6" />
      <path d="M3 6l7 5 7-5" />
    </>,
    p,
  );

export const IconInbox = (p: IconProps) =>
  svg(
    <>
      <path d="M2.5 11.5h4l1 2h5l1-2h4" />
      <path d="M2.5 11.5 4.8 4.6h10.4l2.3 6.9v3.4a1.6 1.6 0 0 1-1.6 1.6H4.1a1.6 1.6 0 0 1-1.6-1.6Z" />
    </>,
    p,
  );

export const IconCheck = (p: IconProps) => svg(<path d="M4 10.5l4 4 8-9" />, p);

export const IconX = (p: IconProps) => svg(<path d="M5 5l10 10M15 5L5 15" />, p);

export const IconReply = (p: IconProps) =>
  svg(
    <>
      <path d="M7.5 5.5 3.5 9.5l4 4" />
      <path d="M3.5 9.5h7.4a5.1 5.1 0 0 1 5.1 5.1v.9" />
    </>,
    p,
  );

/** Widgets. */
export const IconLayout = (p: IconProps) =>
  svg(
    <>
      <rect x="2.6" y="3.2" width="14.8" height="13.6" rx="1.8" />
      <path d="M2.6 8h14.8M8 8v8.8" />
    </>,
    p,
  );

export const IconCode = (p: IconProps) =>
  svg(<path d="M7 6 3.5 10 7 14M13 6l3.5 4-3.5 4" />, p);

export const IconChart = (p: IconProps) =>
  svg(
    <>
      <path d="M3 16.5V9M8 16.5V4.5M13 16.5v-5M18 16.5v-9" />
    </>,
    p,
  );

export const IconFunnel = (p: IconProps) =>
  svg(
    <>
      <path d="M3 4.5h14l-5.2 6v5.2l-3.6 1.8v-7Z" />
    </>,
    p,
  );

export const IconImport = (p: IconProps) =>
  svg(
    <>
      <path d="M10 3v8.5M6.5 8.5 10 12l3.5-3.5" />
      <path d="M3.5 13.5v1.9a1.6 1.6 0 0 0 1.6 1.6h9.8a1.6 1.6 0 0 0 1.6-1.6v-1.9" />
    </>,
    p,
  );

export const IconSettings = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 1.8v2M10 16.2v2M2.6 6l1.7 1M15.7 13l1.7 1M2.6 14l1.7-1M15.7 7l1.7-1" />
    </>,
    p,
  );

export const IconChevronLeft = (p: IconProps) => svg(<path d="M12 5l-5 5 5 5" />, p);
export const IconChevronRight = (p: IconProps) => svg(<path d="M8 5l5 5-5 5" />, p);
export const IconPlus = (p: IconProps) => svg(<path d="M10 4v12M4 10h12" />, p);

export const IconCopy = (p: IconProps) =>
  svg(
    <>
      <rect x="7" y="7" width="9" height="9" rx="1.6" />
      <path d="M13 4.5H5.6A1.6 1.6 0 0 0 4 6.1V13" />
    </>,
    p,
  );

export const IconTrash = (p: IconProps) =>
  svg(
    <>
      <path d="M4 6.5h12M8 6.5V4.8h4v1.7" />
      <path d="M5.5 6.5l.7 9.3h7.6l.7-9.3" />
    </>,
    p,
  );

export const IconStore = (p: IconProps) =>
  svg(
    <>
      <path d="M3.2 7.6 4.6 4h10.8l1.4 3.6" />
      <path d="M3.2 7.6h13.6v7.8a1.6 1.6 0 0 1-1.6 1.6H4.8a1.6 1.6 0 0 1-1.6-1.6Z" />
      <path d="M7.8 17V12h4.4v5" />
    </>,
    p,
  );

export const IconBolt = (p: IconProps) => svg(<path d="M11.5 2.5 5 11h4l-.5 6.5L15 9h-4Z" />, p);

export const IconGift = (p: IconProps) =>
  svg(
    <>
      <rect x="3" y="7.5" width="14" height="9" rx="1.6" />
      <path d="M3 11h14M10 7.5v9" />
      <path d="M10 7.5C9 5.6 8.2 4.4 6.9 4.4a1.8 1.8 0 0 0 0 3.1ZM10 7.5c1-1.9 1.8-3.1 3.1-3.1a1.8 1.8 0 0 1 0 3.1Z" />
    </>,
    p,
  );
