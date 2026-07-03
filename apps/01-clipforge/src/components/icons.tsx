/**
 * ClipForge icon set — per DESIGN.md: 20×20 viewBox, 1.75 stroke, round
 * caps/joins, currentColor. The only icons allowed in the product; never emoji.
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

export function IconFilm(p: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg {...base(p)}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <path d="M6 3.5v13M14 3.5v13M2.5 7.5H6M2.5 12.5H6M14 7.5h3.5M14 12.5h3.5" />
    </svg>
  );
}

export function IconPlus(p: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg {...base(p)}>
      <path d="M10 4.5v11M4.5 10h11" />
    </svg>
  );
}

export function IconUser(p: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg {...base(p)}>
      <circle cx="10" cy="6.5" r="3" />
      <path d="M4 16.5c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" />
    </svg>
  );
}

export function IconChevronLeft(p: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg {...base(p)}>
      <path d="M12.5 4.5 7 10l5.5 5.5" />
    </svg>
  );
}

export function IconRefresh(p: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg {...base(p)}>
      <path d="M16 8.5A6.2 6.2 0 0 0 4.6 7M4 11.5A6.2 6.2 0 0 0 15.4 13" />
      <path d="M16 4.5v4h-4M4 15.5v-4h4" />
    </svg>
  );
}

export function IconDownload(p: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg {...base(p)}>
      <path d="M10 3.5v9M6.5 9.5 10 13l3.5-3.5M3.5 16.5h13" />
    </svg>
  );
}

export function IconScissors(p: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg {...base(p)}>
      <circle cx="5.5" cy="6" r="2" />
      <circle cx="5.5" cy="14" r="2" />
      <path d="M7.2 7.2 16.5 15M7.2 12.8 16.5 5" />
    </svg>
  );
}

export function IconCopy(p: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg {...base(p)}>
      <rect x="7" y="7" width="9.5" height="9.5" rx="2" />
      <path d="M13 4.5V4a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 4v6.5A1.5 1.5 0 0 0 5 12h.5" />
    </svg>
  );
}

export function IconCheck(p: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg {...base(p)}>
      <path className="check" d="M4.5 10.5 8.5 14.5 15.5 6" />
    </svg>
  );
}

export function IconLink(p: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg {...base(p)}>
      <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.54 3.54 0 0 0-5-5L9.75 5.25" />
      <path d="M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.54 3.54 0 0 0 5 5l1.25-1.25" />
    </svg>
  );
}

export function IconUpload(p: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg {...base(p)}>
      <path d="M10 12.5v-9M6.5 6.5 10 3l3.5 3.5M3.5 16.5h13" />
    </svg>
  );
}

export function IconPlay(p: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg {...base(p)}>
      <path d="M6.5 4.5v11l9-5.5-9-5.5Z" />
    </svg>
  );
}

/** Brand mark: a amber rounded square with a film notch. The only amber fill allowed. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="7" fill="#E8A33D" />
      <path d="M8 5v14M16 5v14" stroke="#0B0D12" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
