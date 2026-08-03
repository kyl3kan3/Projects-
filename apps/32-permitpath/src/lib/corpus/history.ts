/**
 * Corpus history: the changes that have already happened, and the diffs still
 * waiting for a curator.
 *
 * A requirements database with no history is indistinguishable from a static
 * guide, which is the thing PermitPath exists to replace. The launch corpus
 * therefore ships with real version chains — the previous version, the diff that
 * produced the new one, who reviewed it and when — plus a handful of crawl diffs
 * sitting in the review queue, because that is the honest state of a system that
 * crawls municipal pages every 72 hours.
 */

import type { FeeLine } from "@/db/schema";
import type { JobType } from "@/lib/taxonomy";

export interface SeededVersionChange {
  jurisdictionSlug: string;
  jobType: JobType;
  /** When the new version was published (and the alert went out). */
  daysAgo: number;
  summary: string;
  rawDiff: string;
  reviewedBy: string;
  /** What the record said before — everything else carries over unchanged. */
  previous: {
    quirks?: string | null;
    reviewTimeline?: string;
    fees?: FeeLine[];
    submittalTitleRemoved?: string;
  };
}

export const SEEDED_VERSION_CHANGES: SeededVersionChange[] = [
  {
    jurisdictionSlug: "mesa-az",
    jobType: "hvac_changeout",
    daysAgo: 34,
    summary: "Load calculation now required for changeouts over 5 tons",
    rawDiff: [
      "- Mechanical permits for like-for-like equipment replacement are issued over the counter.",
      "+ Mechanical permits for like-for-like equipment replacement are issued over the counter.",
      "+ A Manual J load calculation is required for replacements exceeding 5 tons of",
      "+ cooling capacity, and for any replacement where nominal tonnage changes.",
    ].join("\n"),
    reviewedBy: "Dana Whitfield, curator",
    previous: {
      quirks: "Like-for-like changeouts are issued over the counter with equipment cut sheets only.",
      submittalTitleRemoved: "Manual J load calculation",
    },
  },
  {
    jurisdictionSlug: "chandler-az",
    jobType: "solar_pv",
    daysAgo: 21,
    summary: "Expedited residential solar track added — 3 business days for complete packages",
    rawDiff: [
      "- Residential photovoltaic plan review: 10 business days.",
      "+ Residential photovoltaic plan review: 10 business days.",
      "+ Expedited review (3 business days) is available for complete residential",
      "+ packages using listed racking and a standard three-line diagram.",
    ].join("\n"),
    reviewedBy: "Marcus Reyes, curator",
    previous: {
      reviewTimeline: "10 business days",
      quirks: "Solar packages are reviewed in submittal order; expect two weeks in spring.",
    },
  },
  {
    jurisdictionSlug: "gilbert-az",
    jobType: "water_heater",
    daysAgo: 12,
    summary: "Plumbing permit fee increased from $56 to $60",
    rawDiff: [
      "- Water heater replacement .................. $56.00",
      "+ Water heater replacement .................. $60.00",
    ].join("\n"),
    reviewedBy: "Priya Raman, curator",
    previous: {
      fees: [
        { label: "Plumbing permit fee", amountCents: 5_600, notes: "Flat residential rate at the counter" },
        { label: "State construction technology fee", amountCents: 200, notes: "Collected on every permit statewide" },
      ],
    },
  },
  {
    jurisdictionSlug: "maricopa-air-quality",
    jobType: "reroof",
    daysAgo: 47,
    summary: "Asbestos notification waiting period restated as 10 working days",
    rawDiff: [
      "- Notification must be postmarked at least 10 days before the start of work.",
      "+ Notification must be received at least 10 working days before the start of",
      "+ work. Weekends and county holidays do not count toward the waiting period.",
    ].join("\n"),
    reviewedBy: "Dana Whitfield, curator",
    previous: {
      quirks:
        "An asbestos NESHAP survey is required before tear-off on any structure built before 1981, with a 10-day notification.",
    },
  },
];

export interface SeededPendingDiff {
  jurisdictionSlug: string;
  sourceLabel: string;
  jobType: JobType | null;
  daysAgo: number;
  summary: string;
  rawDiff: string;
}

/** Crawl diffs waiting on a curator — the review queue's real content. */
export const SEEDED_PENDING_DIFFS: SeededPendingDiff[] = [
  {
    jurisdictionSlug: "tempe-az",
    sourceLabel: "Development fee schedule",
    jobType: "panel_upgrade",
    daysAgo: 2,
    summary: "3 lines changed near 'electrical service and panel'",
    rawDiff: [
      "@@ Residential electrical @@",
      "- Panel replacement, same service size ..... $145.60",
      "+ Panel replacement, same service size ..... $158.00",
      "- Service upgrade, up to 200A .............. $197.60",
      "+ Service upgrade, up to 200A .............. $214.00",
      "+ Plan review deposit applies to services above 200A.",
    ].join("\n"),
  },
  {
    jurisdictionSlug: "surprise-az",
    sourceLabel: "Permit requirements",
    jobType: "reroof",
    daysAgo: 1,
    summary: "2 lines added near 'roof covering replacement'",
    rawDiff: [
      "@@ Roofing @@",
      "  Roof covering replacement requires a building permit.",
      "+ Underlayment must be inspected before the covering is installed. Roofs",
      "+ covered before the in-progress inspection will be required to be uncovered.",
    ].join("\n"),
  },
  {
    jurisdictionSlug: "goodyear-az",
    sourceLabel: "Permits",
    jobType: null,
    daysAgo: 4,
    summary: "Navigation reworded; no requirement text changed",
    rawDiff: [
      "@@ Page header @@",
      "- Permits & Inspections",
      "+ Permits and Inspections",
    ].join("\n"),
  },
];

/** Sources that stopped answering — silence must never read as "no change". */
export const SEEDED_BROKEN_SOURCES: { jurisdictionSlug: string; sourceLabel: string; error: string }[] = [
  {
    jurisdictionSlug: "youngtown-az",
    sourceLabel: "Building safety",
    error: "HTTP 404 for 3 consecutive crawls — page moved during a site redesign",
  },
];
