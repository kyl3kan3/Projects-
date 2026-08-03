/**
 * Belt-bar colour arithmetic. Pure, no React, no database — so a client
 * component can import it without dragging `postgres` into the browser bundle,
 * and so the contrast rule has a test.
 *
 * The tradition the maths encodes: a stripe is white tape on a coloured belt, and
 * black tape on a white or yellow one. DESIGN.md calls for "computed contrast"
 * rather than a hardcoded choice per rank, because the belt colour is school-
 * editable data and a school may well dye its own.
 */

export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.trim().replace(/^#/, "");
  const full =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 1;
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Canvas on dark belts, ink on white and yellow ones. */
export const STRIPE_LIGHT = "#F6F5F1";
export const STRIPE_DARK = "#262421";

export function stripeColorFor(beltColorHex: string): string {
  return contrastRatio(beltColorHex, STRIPE_LIGHT) >= contrastRatio(beltColorHex, STRIPE_DARK)
    ? STRIPE_LIGHT
    : STRIPE_DARK;
}

/** A safe fallback so a malformed hex in imported data renders as a white belt. */
export function safeBeltHex(hex: string | null | undefined): string {
  if (!hex) return "#F2EFE6";
  return parseHex(hex) ? (hex.startsWith("#") ? hex : `#${hex}`) : "#F2EFE6";
}

/** "18 / 24 classes · 61 / 90 days" — the requirement math, always mono. */
export function requirementMath(input: {
  classesDone: number;
  classesRequired: number;
  daysDone: number;
  daysRequired: number;
}): string {
  const parts: string[] = [];
  if (input.classesRequired > 0) {
    parts.push(`${input.classesDone} / ${input.classesRequired} classes`);
  }
  if (input.daysRequired > 0) {
    parts.push(`${input.daysDone} / ${input.daysRequired} days`);
  }
  return parts.join(" · ") || `${input.classesDone} classes`;
}
