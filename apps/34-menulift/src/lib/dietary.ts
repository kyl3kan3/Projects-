/**
 * Dietary tags.
 *
 * Split out of src/lib/menus.ts because the editor and the guest menu both need
 * this list, and menus.ts reaches the database — importing it from a client
 * component would pull `postgres` into the browser bundle.
 *
 * Four tags, typeset as labels inside a hairline pill. Never icons, never emoji.
 */

export const DIETARY_TAGS = ["GF", "V", "VG", "DF"] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

export const DIETARY_TAG_LABELS: Record<DietaryTag, string> = {
  GF: "Gluten free",
  V: "Vegetarian",
  VG: "Vegan",
  DF: "Dairy free",
};

/** Keep only the four tags the design typesets, in a stable order. */
export function normaliseTags(input: readonly string[] | null | undefined): DietaryTag[] {
  if (!input) return [];
  const upper = new Set(input.map((t) => t.trim().toUpperCase()));
  return DIETARY_TAGS.filter((t) => upper.has(t));
}
