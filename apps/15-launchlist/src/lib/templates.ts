/**
 * The three page templates (ROADMAP phase 1) and the theme tokens the builder
 * exposes.
 *
 * A template is a *layout* decision only — the button construction, the input,
 * the reward gates and the position roll are identical in all three, because
 * DESIGN.md makes those non-negotiable "on every founder theme". What changes is
 * the composition: where the wordmark sits, how the headline is set, whether the
 * proof line leads or follows.
 */

import type { ListTheme, TemplateId } from "@/db/schema";

export interface TemplateDef {
  id: TemplateId;
  name: string;
  /** One honest sentence about when to pick it. */
  summary: string;
  /** Headline alignment on the hosted page. */
  align: "left" | "center";
  /** Where the honest proof line sits relative to the form. */
  proofPosition: "above" | "below";
  /** Display type treatment. */
  headlineCase: "none" | "tight";
}

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  marquee: {
    id: "marquee",
    name: "Marquee",
    summary: "Centered, big headline, form in the thumb zone. The default that screenshots best.",
    align: "center",
    proofPosition: "below",
    headlineCase: "tight",
  },
  ledger: {
    id: "ledger",
    name: "Ledger",
    summary: "Left-aligned and factual. Reads like a changelog entry; good for developer tools.",
    align: "left",
    proofPosition: "above",
    headlineCase: "none",
  },
  manifesto: {
    id: "manifesto",
    name: "Manifesto",
    summary: "Long headline set as a statement, subhead as the argument. For opinionated launches.",
    align: "left",
    proofPosition: "below",
    headlineCase: "none",
  },
};

export const TEMPLATE_IDS: TemplateId[] = ["marquee", "ledger", "manifesto"];

export function template(id: TemplateId): TemplateDef {
  return TEMPLATES[id] ?? TEMPLATES.marquee;
}

/* ----------------------------------------------------------------- themes --- */

/**
 * Ground choices. All are dark: DESIGN.md commits to a single visual world, and
 * a hosted page's job is to make the founder's product look expensive.
 */
export const GROUND_CHOICES: readonly { value: string; label: string }[] = [
  { value: "#0A0E1F", label: "Night" },
  { value: "#101010", label: "Carbon" },
  { value: "#0B1512", label: "Pine" },
  { value: "#151013", label: "Oxblood" },
];

/**
 * Accent choices. Custom-mixed and desaturated, nothing between 250° and 310°
 * (DESIGN_LANGUAGE rule 11) and no framework swatches (rule 12).
 */
export const ACCENT_CHOICES: readonly { value: string; label: string }[] = [
  { value: "#E8654F", label: "Flare" },
  { value: "#D9A227", label: "Brass" },
  { value: "#4BD8BE", label: "Mint" },
  { value: "#5E8BD6", label: "Cobalt" },
  { value: "#C25E86", label: "Rose" },
];

export const TYPE_PAIRS: readonly { value: ListTheme["typePair"]; label: string; summary: string }[] = [
  { value: "grotesk", label: "Grotesk", summary: "Space Grotesk headline, Inter body." },
  { value: "mono", label: "Mono", summary: "IBM Plex Mono headline, Inter body." },
];

export const DEFAULT_THEME: ListTheme = {
  ground: "#0A0E1F",
  accent: "#E8654F",
  typePair: "grotesk",
};

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Reject anything that is not a six-digit hex, and anything in the banned purple
 * band — a founder theme may recolor the accent, but the portfolio's colour law
 * applies to pages we host and serve.
 */
export function sanitizeTheme(input: Partial<ListTheme> | null | undefined): ListTheme {
  const ground = typeof input?.ground === "string" && HEX.test(input.ground) ? input.ground.toUpperCase() : DEFAULT_THEME.ground;
  const accentRaw =
    typeof input?.accent === "string" && HEX.test(input.accent) ? input.accent.toUpperCase() : DEFAULT_THEME.accent;
  const accent = isBannedHue(accentRaw) ? DEFAULT_THEME.accent : accentRaw;
  const typePair = input?.typePair === "mono" ? "mono" : "grotesk";
  return { ground, accent, typePair };
}

/** Hue in [250, 310] — violet through purple. */
export function isBannedHue(hex: string): boolean {
  const h = hueOf(hex);
  if (h === null) return false;
  return h >= 250 && h <= 310;
}

export function hueOf(hex: string): number | null {
  if (!HEX.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Relative luminance, for picking readable text over a founder's ground. */
export function luminance(hex: string): number {
  if (!HEX.test(hex)) return 0;
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The ink to print on a ground. DESIGN.md fixes the primary button as an
 * off-white fill with ink text on dark grounds, and the reverse on light ones —
 * so this decides only which of the two constructions a theme gets.
 */
export function isDarkGround(hex: string): boolean {
  return luminance(hex) < 0.18;
}

/** Default copy for a brand-new list — real content, never lorem. */
export function starterContent(productName: string): {
  headline: string;
  subhead: string;
  ctaLabel: string;
  proofLine: string;
} {
  return {
    headline: `${productName} is coming.`,
    subhead:
      "Join the waitlist and you'll be in the first group let through the door. Refer three friends and skip ahead of everyone who didn't.",
    ctaLabel: "Join the waitlist",
    proofLine: "No spam, one launch email. Unsubscribe in one click.",
  };
}
