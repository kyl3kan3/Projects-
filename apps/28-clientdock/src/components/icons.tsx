/**
 * The icon set. One family, 20x20 viewBox, 1.75 stroke, round caps and joins,
 * currentColor — per DESIGN.md. Nav renders at 22px, inline at 18px.
 *
 * No emoji, anywhere, ever. The celebration on approval is the brass stamp, not
 * a party glyph.
 */

export interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

function svg(path: React.ReactNode, { size = 18, className, style }: IconProps) {
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
      style={style}
    >
      {path}
    </svg>
  );
}

/** Timeline — a rail with dots on it. */
export const IconTimeline = (p: IconProps) =>
  svg(
    <>
      <path d="M5 3.5v13" />
      <circle cx="5" cy="6.5" r="1.6" />
      <circle cx="5" cy="13.5" r="1.6" />
      <path d="M9.5 6.5H16M9.5 13.5H13" />
    </>,
    p,
  );

/** Files. */
export const IconFolder = (p: IconProps) =>
  svg(
    <path d="M2.5 6.2c0-.9.7-1.6 1.6-1.6h2.7c.5 0 1 .25 1.3.66l.8 1.1h5.9c.9 0 1.7.7 1.7 1.6v6c0 .9-.8 1.7-1.7 1.7H4.1c-.9 0-1.6-.8-1.6-1.7V6.2Z" />,
    p,
  );

/** Approvals — a stamp on its pad. This is also the signature glyph. */
export const IconStamp = (p: IconProps) =>
  svg(
    <>
      <path d="M7 8.6V5.4a3 3 0 0 1 6 0v3.2" />
      <path d="M4.2 12.4h11.6l-.7 2.4a1 1 0 0 1-1 .7H5.9a1 1 0 0 1-1-.7l-.7-2.4Z" />
      <path d="M6.6 8.6h6.8c.6 0 1 .5.9 1.1l-.3 1.4H6l-.3-1.4c-.1-.6.3-1.1.9-1.1Z" />
    </>,
    p,
  );

export const IconMessage = (p: IconProps) =>
  svg(
    <path d="M16.5 10.4c0 2.8-2.9 5-6.5 5-.8 0-1.6-.1-2.3-.3L4 16.5l.9-2.6c-1-.9-1.6-2.1-1.6-3.5 0-2.8 2.9-5.1 6.7-5.1s6.5 2.3 6.5 5.1Z" />,
    p,
  );

/** Invoices — a document with a currency rule. */
export const IconInvoice = (p: IconProps) =>
  svg(
    <>
      <path d="M5 3.5h7.2L16 7.2v9.3H5V3.5Z" />
      <path d="M11.8 3.6v3.6H15.9" />
      <path d="M7.6 12.4h4.8M9.2 10.4v4.4" />
    </>,
    p,
  );

/** Awaiting you — a bell, used only on items the client owes an answer on. */
export const IconBell = (p: IconProps) =>
  svg(
    <>
      <path d="M6 8.4a4 4 0 0 1 8 0c0 3 .9 4.3 1.4 4.8H4.6C5.1 12.7 6 11.4 6 8.4Z" />
      <path d="M8.4 15.4a1.8 1.8 0 0 0 3.2 0" />
    </>,
    p,
  );

export const IconChevronLeft = (p: IconProps) => svg(<path d="M12.2 4.5 6.8 10l5.4 5.5" />, p);
export const IconChevronRight = (p: IconProps) => svg(<path d="M7.8 4.5 13.2 10l-5.4 5.5" />, p);
export const IconCheck = (p: IconProps) => svg(<path d="M4.2 10.6 8 14.2l7.8-8.4" />, p);
export const IconX = (p: IconProps) => svg(<path d="M5.2 5.2l9.6 9.6M14.8 5.2 5.2 14.8" />, p);

/** Client view / preview. */
export const IconEye = (p: IconProps) =>
  svg(
    <>
      <path d="M1.8 10S4.6 5.2 10 5.2 18.2 10 18.2 10 15.4 14.8 10 14.8 1.8 10 1.8 10Z" />
      <circle cx="10" cy="10" r="2.1" />
    </>,
    p,
  );

export const IconDuplicate = (p: IconProps) =>
  svg(
    <>
      <path d="M7 7.4h7.4c.6 0 1.1.5 1.1 1.1v7.4c0 .6-.5 1.1-1.1 1.1H7c-.6 0-1.1-.5-1.1-1.1V8.5c0-.6.5-1.1 1.1-1.1Z" />
      <path d="M13 4.6c0-.6-.5-1.1-1.1-1.1H4.5c-.6 0-1.1.5-1.1 1.1V12" />
    </>,
    p,
  );

export const IconSend = (p: IconProps) =>
  svg(
    <>
      <path d="M17 3.5 8.6 11.9" />
      <path d="M17 3.5 12 16.8l-2.3-5.5-5.5-2.3L17 3.5Z" />
    </>,
    p,
  );

export const IconLink = (p: IconProps) =>
  svg(
    <>
      <path d="M8.4 11.6 11.6 8.4" />
      <path d="M9.6 6.4l1.6-1.6a2.9 2.9 0 0 1 4.1 4.1L13.7 10.5" />
      <path d="M10.4 13.6 8.8 15.2a2.9 2.9 0 0 1-4.1-4.1L6.3 9.5" />
    </>,
    p,
  );

/** Module toggle. Drawn as a track, so it reads as a switch at 20px. */
export const IconToggle = (p: IconProps) =>
  svg(
    <>
      <rect x="2.6" y="6.4" width="14.8" height="7.2" rx="3.6" />
      <circle cx="13.6" cy="10" r="1.8" />
    </>,
    p,
  );

/** Agency dashboard — the portals wall. */
export const IconPortals = (p: IconProps) =>
  svg(
    <>
      <path d="M3.4 4.6h5.2v5.2H3.4zM11.4 4.6h5.2v5.2h-5.2zM3.4 11.4h5.2v4h-5.2zM11.4 11.4h5.2v4h-5.2z" />
    </>,
    p,
  );

export const IconSettings = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="2.4" />
      <path d="M10 2.6v2M10 15.4v2M3.8 6.4l1.7 1M14.5 12.6l1.7 1M3.8 13.6l1.7-1M14.5 7.4l1.7-1" />
    </>,
    p,
  );

export const IconUpload = (p: IconProps) =>
  svg(
    <>
      <path d="M10 13.4V4.6" />
      <path d="M6.6 8 10 4.6 13.4 8" />
      <path d="M3.6 13.4v1.4c0 .8.6 1.4 1.4 1.4h10c.8 0 1.4-.6 1.4-1.4v-1.4" />
    </>,
    p,
  );

export const IconDownload = (p: IconProps) =>
  svg(
    <>
      <path d="M10 4.6v8.8" />
      <path d="M6.6 10 10 13.4 13.4 10" />
      <path d="M3.6 13.4v1.4c0 .8.6 1.4 1.4 1.4h10c.8 0 1.4-.6 1.4-1.4v-1.4" />
    </>,
    p,
  );

export const IconPlus = (p: IconProps) => svg(<path d="M10 4.6v10.8M4.6 10h10.8" />, p);

/** Domain / white-label plumbing. */
export const IconGlobe = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="6.6" />
      <path d="M3.5 10h13M10 3.4c1.8 2 2.7 4.2 2.7 6.6S11.8 14.6 10 16.6C8.2 14.6 7.3 12.4 7.3 10S8.2 5.4 10 3.4Z" />
    </>,
    p,
  );

export const IconMail = (p: IconProps) =>
  svg(
    <>
      <path d="M3.4 5.6h13.2v8.8H3.4z" />
      <path d="m3.8 6.2 6.2 4.4 6.2-4.4" />
    </>,
    p,
  );
