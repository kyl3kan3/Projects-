/**
 * Requirement templates, one per job-type code.
 *
 * This is the curator's starting sheet, not the answer: a template supplies the
 * permits, submittal package, and inspection sequence that every jurisdiction in
 * the covered metro shares for that job type, plus how its fee scales against
 * the jurisdiction's own base permit fee. The jurisdiction file then overrides
 * fees, timelines, and quirks with what was actually verified at that counter.
 *
 * Fee arithmetic is integer cents with a single rounding at the edge
 * (`feeBasisPoints` is applied to the jurisdiction's base fee in cents). Money
 * never becomes a float on the way through here.
 */

import type { SubmittalRequirement } from "@/db/schema";
import type { JobType } from "@/lib/taxonomy";

export interface JobTypeTemplate {
  permits: string[];
  submittals: SubmittalRequirement[];
  /** Applied to the jurisdiction's base permit fee: 10000 = ×1.00. */
  feeBasisPoints: number;
  /** Fee lines that do not scale with the jurisdiction's base fee. */
  flatFees: { label: string; amountCents: number; notes?: string }[];
  reviewTimeline: string;
  inspections: string[];
}

const AZ_TECH_FEE = {
  label: "State construction technology fee",
  amountCents: 200,
  notes: "Collected on every permit statewide",
};

export const JOB_TYPE_TEMPLATES: Record<JobType, JobTypeTemplate> = {
  hvac_changeout: {
    permits: ["Mechanical permit"],
    submittals: [
      {
        title: "Equipment cut sheets",
        detail: "Model numbers and rated capacity for condenser and air handler",
        required: true,
      },
      {
        title: "Manual J load calculation",
        detail: "Required when tonnage changes from the equipment being replaced",
        required: false,
      },
      {
        title: "Contractor licence on file",
        detail: "Arizona ROC licence in the classification, current at submittal",
        required: true,
      },
    ],
    feeBasisPoints: 10_000,
    flatFees: [AZ_TECH_FEE],
    reviewTimeline: "Over the counter, same day",
    inspections: ["Mechanical final"],
  },
  mini_split: {
    permits: ["Mechanical permit", "Electrical permit"],
    submittals: [
      { title: "Equipment cut sheets", detail: "Indoor head and condenser, with MOCP rating", required: true },
      { title: "Line-set routing plan", detail: "Sketch showing penetrations and condensate route", required: true },
      { title: "Branch circuit detail", detail: "Conductor size, breaker size, disconnect location", required: true },
    ],
    feeBasisPoints: 13_000,
    flatFees: [AZ_TECH_FEE],
    reviewTimeline: "1-2 business days",
    inspections: ["Rough electrical", "Mechanical final"],
  },
  gas_line: {
    permits: ["Plumbing permit"],
    submittals: [
      { title: "Gas piping isometric", detail: "Developed length, pipe sizes, appliance BTU demand", required: true },
      { title: "Appliance list", detail: "Every appliance on the system with input rating", required: true },
    ],
    feeBasisPoints: 11_000,
    flatFees: [AZ_TECH_FEE],
    reviewTimeline: "1-3 business days",
    inspections: ["Gas pressure test", "Plumbing final"],
  },
  water_heater: {
    permits: ["Plumbing permit"],
    submittals: [
      { title: "Equipment cut sheet", detail: "Capacity, input rating, and vent category", required: true },
      { title: "Venting detail", detail: "Required for any change of vent category or termination", required: false },
      { title: "Expansion tank note", detail: "Confirm thermal expansion control on a closed system", required: true },
    ],
    feeBasisPoints: 8_000,
    flatFees: [AZ_TECH_FEE],
    reviewTimeline: "Over the counter, same day",
    inspections: ["Plumbing final"],
  },
  repipe: {
    permits: ["Plumbing permit"],
    submittals: [
      { title: "Riser diagram", detail: "New supply routing by fixture group, pipe material and size", required: true },
      { title: "Material listing", detail: "Approved piping material with listing number", required: true },
      { title: "Occupied-dwelling plan", detail: "How water service is maintained during the work", required: false },
    ],
    feeBasisPoints: 22_000,
    flatFees: [AZ_TECH_FEE],
    reviewTimeline: "3-5 business days",
    inspections: ["Rough plumbing with pressure test", "Wall cover", "Plumbing final"],
  },
  sewer_replacement: {
    permits: ["Plumbing permit", "Right-of-way permit"],
    submittals: [
      { title: "Site plan with sewer run", detail: "Cleanout locations, slope, and point of connection", required: true },
      { title: "Traffic control plan", detail: "Required whenever the trench crosses the street", required: false },
      { title: "Blue Stake ticket", detail: "Arizona 811 ticket number, dated within 15 days", required: true },
    ],
    feeBasisPoints: 24_000,
    flatFees: [
      AZ_TECH_FEE,
      { label: "Pavement restoration deposit", amountCents: 45_000, notes: "Refunded after the patch passes" },
    ],
    reviewTimeline: "5-7 business days",
    inspections: ["Trench and bedding", "Sewer air test", "Backfill and patch"],
  },
  panel_upgrade: {
    permits: ["Electrical permit"],
    submittals: [
      { title: "Panel schedule", detail: "Bus rating, main breaker size, and circuit directory", required: true },
      { title: "Load calculation", detail: "NEC 220 standard or optional method for the dwelling", required: true },
      { title: "Grounding electrode detail", detail: "Ufer, rod, or water pipe with bonding jumper size", required: true },
    ],
    feeBasisPoints: 14_000,
    flatFees: [AZ_TECH_FEE],
    reviewTimeline: "1-2 business days",
    inspections: ["Panel rough", "Electrical final"],
  },
  service_upgrade: {
    permits: ["Electrical permit"],
    submittals: [
      { title: "Load calculation", detail: "NEC 220 calculation supporting the new service size", required: true },
      { title: "Service riser detail", detail: "Conductor size, conduit, meter location, mast height", required: true },
      { title: "Utility work order", detail: "Serving utility's job number for the meter release", required: true },
    ],
    feeBasisPoints: 19_000,
    flatFees: [AZ_TECH_FEE],
    reviewTimeline: "3-5 business days, plus utility scheduling",
    inspections: ["Service rough", "Meter release inspection", "Electrical final"],
  },
  ev_charger: {
    permits: ["Electrical permit"],
    submittals: [
      { title: "Load calculation", detail: "Existing service capacity with the charger added", required: true },
      { title: "Charger cut sheet", detail: "Listed EVSE with continuous current rating", required: true },
      { title: "Circuit and mounting detail", detail: "Conductor size, breaker, disconnect, mounting height", required: true },
    ],
    feeBasisPoints: 9_500,
    flatFees: [AZ_TECH_FEE],
    reviewTimeline: "1-2 business days",
    inspections: ["Electrical final"],
  },
  solar_pv: {
    permits: ["Electrical permit", "Building permit"],
    submittals: [
      { title: "Three-line electrical diagram", detail: "Modules, inverters, rapid shutdown, point of interconnection", required: true },
      { title: "Structural letter", detail: "Sealed by an Arizona-registered engineer for the mounting system", required: true },
      { title: "Site plan with fire setbacks", detail: "Ridge and eave pathways per the adopted fire code", required: true },
      { title: "Utility interconnection application", detail: "Approval to install from the serving utility", required: true },
      { title: "Battery listing", detail: "UL 9540 listing and separation detail when storage is included", required: false },
    ],
    feeBasisPoints: 32_000,
    flatFees: [AZ_TECH_FEE],
    reviewTimeline: "5-10 business days",
    inspections: ["Rough electrical and racking", "Solar final with utility witness"],
  },
  reroof: {
    permits: ["Building permit"],
    submittals: [
      { title: "Roof covering listing", detail: "Product approval or evaluation report for the covering", required: true },
      { title: "Underlayment and fastening schedule", detail: "Layers, nailing pattern, and wind exposure", required: true },
      { title: "Structural note for tile", detail: "Required when changing from shingle to concrete tile", required: false },
    ],
    feeBasisPoints: 14_000,
    flatFees: [AZ_TECH_FEE],
    reviewTimeline: "Over the counter, same day",
    inspections: ["Dry-in / in-progress", "Roofing final"],
  },
  window_replacement: {
    permits: ["Building permit"],
    submittals: [
      { title: "Window schedule", detail: "Sizes, U-factor, SHGC, and tempered locations", required: true },
      { title: "Egress confirmation", detail: "Net clear opening for every sleeping-room window", required: true },
    ],
    feeBasisPoints: 9_000,
    flatFees: [AZ_TECH_FEE],
    reviewTimeline: "Over the counter, same day",
    inspections: ["Window final"],
  },
};

/** The permit fee line, scaled from the jurisdiction's base fee. Cents in, cents out. */
export function scaledPermitFeeCents(baseFeeCents: number, feeBasisPoints: number): number {
  return Math.round((baseFeeCents * feeBasisPoints) / 10_000);
}
