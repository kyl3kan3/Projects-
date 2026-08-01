/**
 * The icon set: one family, 20×20 viewBox, 1.75px stroke, round caps and joins,
 * currentColor. No emoji anywhere in the product — severity is a label chip.
 *
 * Rendered at 22px in navigation and 18px inline, per DESIGN.md.
 */

const OPEN = (size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">`;

type IconName =
  | "reviews"
  | "repo"
  | "rulebook"
  | "account"
  | "merge-node"
  | "file-code"
  | "diff"
  | "check"
  | "x-dismiss"
  | "shield"
  | "bug"
  | "gauge"
  | "chevron-down"
  | "chevron-right"
  | "link"
  | "plus";

const PATHS: Record<IconName, string> = {
  reviews:
    '<path d="M17 11.5a2.5 2.5 0 0 1-2.5 2.5H7l-3.5 3v-3H3a2.5 2.5 0 0 1 0-5"/><path d="M3 6a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 17 6"/><path d="M7 8.5 9 10.5l4-4"/>',
  repo: '<path d="M4 3.5h9a1.5 1.5 0 0 1 1.5 1.5v11l-4-2-4 2V3.5"/><path d="M4 3.5v13h10.5"/>',
  rulebook:
    '<path d="M3 6h5"/><path d="M12 6h5"/><path d="M3 14h9"/><circle cx="10" cy="6" r="2"/><circle cx="15" cy="14" r="2"/>',
  account: '<circle cx="10" cy="7" r="3"/><path d="M4 17a6 6 0 0 1 12 0"/>',
  "merge-node":
    '<path d="M6 4v6a4 4 0 0 0 4 4h2"/><circle cx="6" cy="3" r="1.5"/><circle cx="14" cy="14" r="1.5"/>',
  "file-code":
    '<path d="M11 3H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7l-4-4Z"/><path d="M11 3v4h4"/><path d="M8.5 11 7 12.5 8.5 14"/><path d="M12 11l1.5 1.5L12 14"/>',
  diff: '<path d="M10 4v6"/><path d="M7 7h6"/><path d="M7 15h6"/>',
  check: '<path d="M4.5 10.5 8 14l7.5-8"/>',
  "x-dismiss": '<path d="M5.5 5.5l9 9"/><path d="M14.5 5.5l-9 9"/>',
  shield: '<path d="M10 3l6 2v5c0 3.5-2.5 6-6 7-3.5-1-6-3.5-6-7V5l6-2Z"/><path d="M7.5 10 9.5 12l3.5-3.5"/>',
  bug: '<path d="M7 8a3 3 0 0 1 6 0v4a3 3 0 0 1-6 0V8Z"/><path d="M7 10H4"/><path d="M16 10h-3"/><path d="M7.5 6 6 4.5"/><path d="M12.5 6 14 4.5"/><path d="M7.5 14 6 15.5"/><path d="M12.5 14 14 15.5"/>',
  gauge: '<path d="M4 14a6 6 0 1 1 12 0"/><path d="M10 14l3-3.5"/>',
  "chevron-down": '<path d="M5.5 8 10 12.5 14.5 8"/>',
  "chevron-right": '<path d="M8 5.5 12.5 10 8 14.5"/>',
  link: '<path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-1 1"/><path d="M11.5 8.5a3 3 0 0 0-4.2 0L5 10.8a3 3 0 0 0 4.2 4.2l1-1"/>',
  plus: '<path d="M10 4.5v11"/><path d="M4.5 10h11"/>',
};

export function icon(name: IconName, size = 18): string {
  return `${OPEN(size)}${PATHS[name]}</svg>`;
}

export type { IconName };
