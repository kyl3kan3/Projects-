/**
 * src/lib/requirement-presets.ts
 *
 * The requirement templates a new org starts with.
 *
 * These are the limits that actually appear in mid-market property-management and
 * general-contractor insurance addenda: $1M/$2M general liability, $1M auto, and
 * statutory workers' comp with a $1M employers'-liability each-accident limit, plus
 * a $5M umbrella on the structural-sub template. They are a starting point to edit,
 * not legal advice, and the requirements screen says so.
 *
 * Kept out of lib/auth.ts so a client component can render the preset list without
 * pulling the session and the db client into the browser bundle.
 */

import type { RequirementFlags, RequirementLine } from "@/db/schema";

export interface TemplatePreset {
  name: string;
  lines: RequirementLine[];
  flags: RequirementFlags;
  notes: string;
}

const M = (millions: number) => Math.round(millions * 1_000_000 * 100);

export const DEFAULT_TEMPLATES: TemplatePreset[] = [
  {
    name: "Standard vendor",
    lines: [
      { coverage: "gl_each_occurrence", label: "GL each occurrence", minCents: M(1) },
      { coverage: "gl_aggregate", label: "GL general aggregate", minCents: M(2) },
      { coverage: "auto_combined", label: "Auto combined single limit", minCents: M(1) },
      { coverage: "wc_each_accident", label: "Workers' comp each accident", minCents: M(1) },
    ],
    flags: { additionalInsured: true, waiverOfSubrogation: true, primaryNonContributory: false },
    notes:
      "The usual vendor addendum: $1M/$2M general liability, $1M auto, statutory workers' comp with a $1M employers' liability each-accident limit. Edit these to match your own contract.",
  },
  {
    name: "Sub — structural",
    lines: [
      { coverage: "gl_each_occurrence", label: "GL each occurrence", minCents: M(1) },
      { coverage: "gl_aggregate", label: "GL general aggregate", minCents: M(2) },
      { coverage: "auto_combined", label: "Auto combined single limit", minCents: M(1) },
      { coverage: "umbrella_each", label: "Umbrella each occurrence", minCents: M(5) },
      { coverage: "wc_each_accident", label: "Workers' comp each accident", minCents: M(1) },
    ],
    flags: { additionalInsured: true, waiverOfSubrogation: true, primaryNonContributory: true },
    notes:
      "Structural, roofing and elevated work: the standard lines plus a $5M umbrella. Primary and non-contributory is recorded here for the file — evidencing it needs the endorsement page, which CertShield does not read yet.",
  },
  {
    name: "Low-risk service",
    lines: [
      { coverage: "gl_each_occurrence", label: "GL each occurrence", minCents: M(1) },
      { coverage: "gl_aggregate", label: "GL general aggregate", minCents: M(2) },
    ],
    flags: { additionalInsured: true, waiverOfSubrogation: false, primaryNonContributory: false },
    notes:
      "Cleaning, landscaping, pest control and other vendors who bring no vehicles or crews on site.",
  },
];

/** Trades a new org's vendor form offers — real trades, in the order they appear. */
export const TRADES = [
  "Roofing",
  "HVAC",
  "Plumbing",
  "Electrical",
  "General contracting",
  "Landscaping",
  "Janitorial",
  "Pest control",
  "Elevator",
  "Fire & life safety",
  "Painting",
  "Snow removal",
  "Flooring",
  "Structural",
  "Security",
  "Waste hauling",
] as const;
