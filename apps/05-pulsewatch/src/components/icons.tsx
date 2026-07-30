/**
 * The icon set. One family, 20x20 viewBox, 1.75 stroke, round caps and joins,
 * currentColor — per DESIGN.md. No emoji anywhere, ever: an outage is a red dot
 * and the word "DOWN", not a siren glyph.
 *
 * Nav renders at 22px, inline at 18px.
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

/** Monitors — a trace with one beat in it. */
export const IconPulse = (p: IconProps) =>
  svg(<path d="M1.5 10.5h4l2-5 2.5 9 2-4h4.5" />, p);

/** Incidents. */
export const IconFlame = (p: IconProps) =>
  svg(
    <>
      <path d="M10 18c2.8 0 5-2.1 5-4.8 0-3.6-3.4-5.3-3.4-8.7 0-1-.5-1.9-1.3-2.5-1 2.3-2.6 3-4 4.7A6.6 6.6 0 0 0 5 13.2C5 15.9 7.2 18 10 18Z" />
      <path d="M10 18c1.2 0 2.1-1 2.1-2.2 0-1.6-1.5-2.3-1.5-3.8-.7.9-1.6 1.5-2.2 2.4a2.9 2.9 0 0 0-.5 1.6c0 1.2 1 2 2.1 2Z" />
    </>,
    p,
  );

/** Status pages. */
export const IconBroadcast = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="1.6" />
      <path d="M6.6 6.6a4.8 4.8 0 0 0 0 6.8M13.4 13.4a4.8 4.8 0 0 0 0-6.8" />
      <path d="M4.2 4.2a8.2 8.2 0 0 0 0 11.6M15.8 15.8a8.2 8.2 0 0 0 0-11.6" />
    </>,
    p,
  );

export const IconGear = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 1.8v2M10 16.2v2M2.6 6l1.7 1M15.7 13l1.7 1M2.6 14l1.7-1M15.7 7l1.7-1" />
    </>,
    p,
  );

export const IconGlobe = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M2.5 10h15M10 2.5c2 2.2 3 4.7 3 7.5s-1 5.3-3 7.5c-2-2.2-3-4.7-3-7.5s1-5.3 3-7.5Z" />
    </>,
    p,
  );

/** Cron heartbeat — a beat with a gap where a ping should be. */
export const IconHeartbeat = (p: IconProps) =>
  svg(
    <>
      <path d="M2 10h3l1.5-3.5L9 14l2-6 1.5 2H18" />
      <circle cx="9" cy="14" r="0.9" fill="currentColor" stroke="none" />
    </>,
    p,
  );

export const IconLockSsl = (p: IconProps) =>
  svg(
    <>
      <rect x="4" y="8.8" width="12" height="8.2" rx="1.6" />
      <path d="M7 8.8V6.6a3 3 0 0 1 6 0v2.2" />
      <path d="M10 12.2v1.8" />
    </>,
    p,
  );

export const IconBell = (p: IconProps) =>
  svg(
    <>
      <path d="M5.5 8.5a4.5 4.5 0 0 1 9 0c0 3 .8 4.4 1.5 5.2H4c.7-.8 1.5-2.2 1.5-5.2Z" />
      <path d="M8.2 16.2a2 2 0 0 0 3.6 0" />
    </>,
    p,
  );

export const IconWebhook = (p: IconProps) =>
  svg(
    <>
      <circle cx="10" cy="5.5" r="2.2" />
      <circle cx="5" cy="14.5" r="2.2" />
      <circle cx="15" cy="14.5" r="2.2" />
      <path d="M8.8 7.4 6.2 12.4M11.2 7.4l2.6 5M7.2 14.5h5.6" />
    </>,
    p,
  );

export const IconSlackHash = (p: IconProps) =>
  svg(
    <>
      <path d="M7.4 3v14M12.6 3v14M3 7.4h14M3 12.6h14" />
    </>,
    p,
  );

export const IconDiscord = (p: IconProps) =>
  svg(
    <>
      <path d="M6.6 15.2c-1.9-1-3-3-3-5.4 0-1.9.7-3.6 1.9-4.8 1-.5 2-.8 3-1l.5 1.1a10 10 0 0 1 2 0L11.5 4c1 .2 2 .5 3 1 1.2 1.2 1.9 2.9 1.9 4.8 0 2.4-1.1 4.4-3 5.4" />
      <path d="M6.6 15.2 6 16.8c1.3.7 2.6 1 4 1s2.7-.3 4-1l-.6-1.6" />
      <path d="M7.8 10.4h.01M12.2 10.4h.01" />
    </>,
    p,
  );

export const IconPause = (p: IconProps) =>
  svg(<path d="M7.5 4.5v11M12.5 4.5v11" />, p);

export const IconPlay = (p: IconProps) =>
  svg(<path d="M6.5 4.2l9 5.8-9 5.8V4.2Z" />, p);

export const IconCheck = (p: IconProps) => svg(<path d="M4 10.5l4 4 8-9" />, p);

export const IconChevronRight = (p: IconProps) => svg(<path d="M8 5l5 5-5 5" />, p);

export const IconPlus = (p: IconProps) => svg(<path d="M10 4v12M4 10h12" />, p);

export const IconRefresh = (p: IconProps) =>
  svg(
    <>
      <path d="M17 10a7 7 0 1 1-2.1-5" />
      <path d="M17 3.5V8h-4.5" />
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

export const IconCopy = (p: IconProps) =>
  svg(
    <>
      <rect x="7" y="7" width="9" height="9" rx="1.6" />
      <path d="M13 4.5H5.6A1.6 1.6 0 0 0 4 6.1V13" />
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

/** Icon for a monitor type, so lists stay legible at a glance. */
export function MonitorTypeIcon({
  type,
  size = 18,
  className,
}: {
  type: "http" | "heartbeat" | "ssl" | "domain";
  size?: number;
  className?: string;
}) {
  switch (type) {
    case "heartbeat":
      return <IconHeartbeat size={size} className={className} />;
    case "ssl":
      return <IconLockSsl size={size} className={className} />;
    case "domain":
      return <IconGlobe size={size} className={className} />;
    default:
      return <IconPulse size={size} className={className} />;
  }
}

export function ChannelIcon({ kind, size = 18 }: { kind: string; size?: number }) {
  switch (kind) {
    case "email":
      return <IconMail size={size} />;
    case "slack":
      return <IconSlackHash size={size} />;
    case "discord":
      return <IconDiscord size={size} />;
    default:
      return <IconWebhook size={size} />;
  }
}
