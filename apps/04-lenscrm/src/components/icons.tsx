/** Single SVG set: 20×20, 1.75 stroke, round caps/joins, currentColor. */
import type { SVGProps } from "react";
function base(p: SVGProps<SVGSVGElement> & { size?: number }) {
  const { size = 20, ...rest } = p;
  return { width: size, height: size, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...rest };
}
type P = SVGProps<SVGSVGElement> & { size?: number };
export const IconToday = (p: P) => (<svg {...base(p)}><circle cx="10" cy="10" r="3.5"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.8 4.8l1.4 1.4M13.8 13.8l1.4 1.4M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4"/></svg>);
export const IconLeads = (p: P) => (<svg {...base(p)}><path d="M3 4.5h14l-5.2 6v4l-3.6 1.5v-5.5L3 4.5Z"/></svg>);
export const IconSessions = (p: P) => (<svg {...base(p)}><rect x="3" y="4.5" width="14" height="12" rx="2"/><path d="M3 8h14M7 3v3M13 3v3"/></svg>);
export const IconGalleries = (p: P) => (<svg {...base(p)}><rect x="3" y="3" width="14" height="14" rx="1.5"/><circle cx="7.5" cy="7.5" r="1.5"/><path d="m4 15 4-4 3 3 2.5-2.5L17 14"/></svg>);
export const IconMore = (p: P) => (<svg {...base(p)}><circle cx="5" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/></svg>);
export const IconHeart = (p: P) => (<svg {...base(p)}><path d="M10 16.5S3.5 12.7 3.5 8.2A3.2 3.2 0 0 1 10 6a3.2 3.2 0 0 1 6.5 2.2c0 4.5-6.5 8.3-6.5 8.3Z"/></svg>);
export const IconPen = (p: P) => (<svg {...base(p)}><path d="M13.5 3.5 16.5 6.5 7 16 3.5 16.5 4 13 13.5 3.5Z"/></svg>);
export const IconSend = (p: P) => (<svg {...base(p)}><path d="M17 3 9 11M17 3l-5.5 14-2.5-6-6-2.5L17 3Z"/></svg>);
export const IconDownload = (p: P) => (<svg {...base(p)}><path d="M10 3.5v9M6.5 9.5 10 13l3.5-3.5M3.5 16.5h13"/></svg>);
export const IconReceipt = (p: P) => (<svg {...base(p)}><path d="M5 2.5h10v15l-2-1.2-1.7 1.2L10 16.3 8.3 17.5 6.7 16.3 5 17.5V2.5Z"/><path d="M8 6.5h4M8 9.5h4"/></svg>);
export const IconClock = (p: P) => (<svg {...base(p)}><circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 1.5"/></svg>);
export const IconCheck = (p: P) => (<svg {...base(p)}><path d="M4 10.5 8.5 15 16 5.5"/></svg>);
export const IconChevronLeft = (p: P) => (<svg {...base(p)}><path d="M12.5 4.5 7 10l5.5 5.5"/></svg>);
export const IconPlus = (p: P) => (<svg {...base(p)}><path d="M10 4.5v11M4.5 10h11"/></svg>);
export const IconComment = (p: P) => (<svg {...base(p)}><path d="M4 4.5h12v9H8l-3 3v-3H4v-9Z"/></svg>);

/** The 6-blade aperture — the brand glyph. */
export function Aperture({ size = 24, stroke = "#C9A227" }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke={stroke} strokeWidth="1.5" />
      <path d="M12 3l4.5 7.8M21 12h-9M16.5 20.2 12 12M7.5 20.2 12 12M3 12h9M7.5 3.8 12 12" stroke={stroke} strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="6" fill="#1D1D1B" stroke="#2A2A27" />
      <circle cx="12" cy="12" r="6" stroke="#C9A227" strokeWidth="1.4" fill="none" />
      <path d="M12 6l3 5.2M18 12h-6M15 17.2 12 12M9 17.2 12 12M6 12h6M9 6.8 12 12" stroke="#C9A227" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
