/**
 * The single icon set: 20×20 viewBox, 1.75 stroke, round caps/joins,
 * currentColor. Nav renders at 22, inline at 18. No emoji, anywhere, ever.
 */

import type { SVGProps } from "react";

function base(props: SVGProps<SVGSVGElement> & { size?: number }) {
  const { size = 20, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

type P = SVGProps<SVGSVGElement> & { size?: number };

export const IconGauge = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 12.5a7 7 0 1 1 14 0" />
    <path d="M10 12.5 13.5 8" />
    <path d="M3.5 16.5h13" />
  </svg>
);

export const IconHourglass = (p: P) => (
  <svg {...base(p)}>
    <path d="M5.5 3h9M5.5 17h9" />
    <path d="M6.5 3c0 5 7 5 7 7s-7 2-7 7M13.5 3c0 5-7 5-7 7s7 2 7 7" />
  </svg>
);

export const IconListSteps = (p: P) => (
  <svg {...base(p)}>
    <path d="M7.5 5h9M7.5 10h9M7.5 15h9" />
    <circle cx="3.75" cy="5" r="1" fill="currentColor" stroke="none" />
    <circle cx="3.75" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="3.75" cy="15" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconGear = (p: P) => (
  <svg {...base(p)}>
    <circle cx="10" cy="10" r="2.75" />
    <path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M15.3 4.7l-1.6 1.6M6.3 13.7l-1.6 1.6" />
  </svg>
);

export const IconArrowDownLeft = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 5 5 15" />
    <path d="M12.5 15H5V7.5" />
  </svg>
);

export const IconRefresh = (p: P) => (
  <svg {...base(p)}>
    <path d="M16 8.5A6.2 6.2 0 0 0 4.6 7M4 11.5A6.2 6.2 0 0 0 15.4 13" />
    <path d="M16 4.5v4h-4M4 15.5v-4h4" />
  </svg>
);

export const IconMail = (p: P) => (
  <svg {...base(p)}>
    <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
    <path d="m3.5 6 6.5 5 6.5-5" />
  </svg>
);

export const IconPause = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 4.5v11M13 4.5v11" />
  </svg>
);

export const IconPlay = (p: P) => (
  <svg {...base(p)}>
    <path d="M6.5 4.5v11l9-5.5-9-5.5Z" />
  </svg>
);

export const IconDownload = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 3.5v9M6.5 9.5 10 13l3.5-3.5M3.5 16.5h13" />
  </svg>
);

export const IconCard = (p: P) => (
  <svg {...base(p)}>
    <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
    <path d="M2.5 8.5h15M5.5 12.5h3" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 10.5 8.5 15 16 5.5" />
  </svg>
);

export const IconChevronRight = (p: P) => (
  <svg {...base(p)}>
    <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 4.5v11M4.5 10h11" />
  </svg>
);

/** Brand mark: a graphite square with the return arrow in banknote. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="7" fill="#181D20" stroke="#232A2E" />
      <path
        d="M16 8 8 16M13.5 16H8v-5.5"
        stroke="#33A06F"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
