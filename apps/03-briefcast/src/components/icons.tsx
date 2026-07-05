/** Single SVG set: 20×20 viewBox, 1.75 stroke, round caps/joins, currentColor. */

import type { SVGProps } from "react";

function base(p: SVGProps<SVGSVGElement> & { size?: number }) {
  const { size = 20, ...rest } = p;
  return {
    width: size, height: size, viewBox: "0 0 20 20", fill: "none",
    stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...rest,
  };
}
type P = SVGProps<SVGSVGElement> & { size?: number };

export const IconBriefs = (p: P) => (<svg {...base(p)}><rect x="4" y="3" width="10" height="13" rx="1.5"/><path d="M16 6v10.5a1 1 0 0 1-1 1H6.5"/><path d="M6.5 6.5h5M6.5 9.5h5M6.5 12.5h3"/></svg>);
export const IconDeals = (p: P) => (<svg {...base(p)}><path d="M3 4.5h14l-5.2 6v4l-3.6 1.5v-5.5L3 4.5Z"/></svg>);
export const IconSlack = (p: P) => (<svg {...base(p)}><path d="M7 3.5v9M13 7.5v9M3.5 13h9M7.5 7h9"/></svg>);
export const IconGear = (p: P) => (<svg {...base(p)}><circle cx="10" cy="10" r="2.75"/><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M15.3 4.7l-1.6 1.6M6.3 13.7l-1.6 1.6"/></svg>);
export const IconCheck = (p: P) => (<svg {...base(p)}><path d="M4 10.5 8.5 15 16 5.5"/></svg>);
export const IconArrowRight = (p: P) => (<svg {...base(p)}><path d="M4 10h12M11 5l5 5-5 5"/></svg>);
export const IconSync = (p: P) => (<svg {...base(p)}><path d="M16 8.5A6.2 6.2 0 0 0 4.6 7M4 11.5A6.2 6.2 0 0 0 15.4 13"/><path d="M16 4.5v4h-4M4 15.5v-4h4"/></svg>);
export const IconChevronDown = (p: P) => (<svg {...base(p)}><path d="m5 7.5 5 5 5-5"/></svg>);
export const IconFlag = (p: P) => (<svg {...base(p)}><path d="M5 17V3.5M5 4h9l-2 3 2 3H5"/></svg>);
export const IconMic = (p: P) => (<svg {...base(p)}><rect x="7.5" y="2.5" width="5" height="9" rx="2.5"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5"/></svg>);
export const IconLink = (p: P) => (<svg {...base(p)}><path d="M8 12a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2L9 6.8"/><path d="M12 8a3 3 0 0 0-4.2 0L5.5 10.3a3 3 0 0 0 4.2 4.2L11 13.2"/></svg>);
export const IconCalendar = (p: P) => (<svg {...base(p)}><rect x="3" y="4.5" width="14" height="12" rx="2"/><path d="M3 8h14M7 3v3M13 3v3"/></svg>);

export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="7" fill="#221D18"/>
      <path d="M7 6.5h7a2 2 0 0 1 2 2v9a1 1 0 0 1-1 1H8.5" stroke="#FAF7F2" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M9.5 10h4M9.5 13h2.5" stroke="#2456F0" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}
