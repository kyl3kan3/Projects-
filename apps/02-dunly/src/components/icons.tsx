import type { SVGProps } from "react";

export type IconName =
  | "gauge"
  | "hourglass"
  | "list-steps"
  | "gear"
  | "arrow-down-left"
  | "refresh"
  | "mail"
  | "message-sms"
  | "pause"
  | "play"
  | "download"
  | "card"
  | "check"
  | "chevron-right"
  | "plus";

const paths: Record<IconName, React.ReactNode> = {
  gauge: (
    <>
      <path d="M4 13a6 6 0 0 1 12 0" />
      <path d="M10 13l3-4" />
      <path d="M5.5 16h9" />
    </>
  ),
  hourglass: (
    <>
      <path d="M6 3h8" />
      <path d="M6 17h8" />
      <path d="M7 3c0 4 6 4 6 7s-6 3-6 7" />
      <path d="M13 3c0 4-6 4-6 7s6 3 6 7" />
    </>
  ),
  "list-steps": (
    <>
      <path d="M6 5h10" />
      <path d="M6 10h10" />
      <path d="M6 15h10" />
      <path d="M3 5h.01" />
      <path d="M3 10h.01" />
      <path d="M3 15h.01" />
    </>
  ),
  gear: (
    <>
      <path d="M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
      <path d="M16 10a6.4 6.4 0 0 0-.1-1l1.6-1.2-1.6-2.7-1.9.8a7 7 0 0 0-1.7-1L12 3H8l-.3 1.9a7 7 0 0 0-1.7 1l-1.9-.8-1.6 2.7L4.1 9a6.4 6.4 0 0 0 0 2l-1.6 1.2 1.6 2.7 1.9-.8a7 7 0 0 0 1.7 1L8 17h4l.3-1.9a7 7 0 0 0 1.7-1l1.9.8 1.6-2.7L15.9 11c.1-.3.1-.7.1-1Z" />
    </>
  ),
  "arrow-down-left": (
    <>
      <path d="M15 5L6 14" />
      <path d="M6 7v7h7" />
    </>
  ),
  refresh: (
    <>
      <path d="M16 9a6 6 0 1 0-1.6 4.1" />
      <path d="M16 5v4h-4" />
    </>
  ),
  mail: (
    <>
      <path d="M3 5h14v10H3z" />
      <path d="m3 6 7 5 7-5" />
    </>
  ),
  "message-sms": (
    <>
      <path d="M4 5h12v8H8l-4 3V5Z" />
      <path d="M7 9h.01" />
      <path d="M10 9h.01" />
      <path d="M13 9h.01" />
    </>
  ),
  pause: (
    <>
      <path d="M7 5v10" />
      <path d="M13 5v10" />
    </>
  ),
  play: <path d="M7 5v10l8-5-8-5Z" />,
  download: (
    <>
      <path d="M10 3v9" />
      <path d="m6 9 4 4 4-4" />
      <path d="M4 16h12" />
    </>
  ),
  card: (
    <>
      <path d="M3 5h14v10H3z" />
      <path d="M3 8h14" />
      <path d="M6 12h3" />
    </>
  ),
  check: (
    <>
      <path d="m4 10 4 4 8-8" />
    </>
  ),
  "chevron-right": <path d="m8 5 5 5-5 5" />,
  plus: (
    <>
      <path d="M10 4v12" />
      <path d="M4 10h12" />
    </>
  ),
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
