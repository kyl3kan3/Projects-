/**
 * Job-type taxonomy, v1 — frozen (ROADMAP Phase 0).
 *
 * Twelve codes across the five trades PermitPath serves. The code is what the
 * corpus keys requirement records by, so it is a stable identifier and never a
 * display string. Pure module: safe to import from client components.
 */

export const JOB_TYPES = [
  "hvac_changeout",
  "mini_split",
  "gas_line",
  "water_heater",
  "repipe",
  "sewer_replacement",
  "panel_upgrade",
  "service_upgrade",
  "ev_charger",
  "solar_pv",
  "reroof",
  "window_replacement",
] as const;

export type JobType = (typeof JOB_TYPES)[number];

export type Trade = "hvac" | "plumbing" | "electrical" | "roofing" | "solar";

interface JobTypeMeta {
  code: JobType;
  label: string;
  trade: Trade;
  /** One line a contractor would recognise, used on chips and empty states. */
  scope: string;
}

export const JOB_TYPE_META: Record<JobType, JobTypeMeta> = {
  hvac_changeout: {
    code: "hvac_changeout",
    label: "HVAC changeout",
    trade: "hvac",
    scope: "Like-for-like condenser and air handler replacement, existing ductwork",
  },
  mini_split: {
    code: "mini_split",
    label: "Mini-split add",
    trade: "hvac",
    scope: "Ductless head plus outdoor unit, new refrigerant line set and circuit",
  },
  gas_line: {
    code: "gas_line",
    label: "Gas line",
    trade: "plumbing",
    scope: "New or extended fuel-gas piping to an appliance, pressure test required",
  },
  water_heater: {
    code: "water_heater",
    label: "Water heater",
    trade: "plumbing",
    scope: "Tank or tankless replacement, including venting and seismic strapping",
  },
  repipe: {
    code: "repipe",
    label: "Whole-house repipe",
    trade: "plumbing",
    scope: "Replacing supply piping throughout an occupied dwelling",
  },
  sewer_replacement: {
    code: "sewer_replacement",
    label: "Sewer replacement",
    trade: "plumbing",
    scope: "Building sewer replacement or lining from structure to the main",
  },
  panel_upgrade: {
    code: "panel_upgrade",
    label: "Panel upgrade",
    trade: "electrical",
    scope: "Load center replacement at the same service size",
  },
  service_upgrade: {
    code: "service_upgrade",
    label: "Service upgrade",
    trade: "electrical",
    scope: "Increasing service capacity, utility coordination and a meter release",
  },
  ev_charger: {
    code: "ev_charger",
    label: "EV charger",
    trade: "electrical",
    scope: "Level 2 charger on a dedicated branch circuit, load calculation required",
  },
  solar_pv: {
    code: "solar_pv",
    label: "Solar PV",
    trade: "solar",
    scope: "Rooftop PV with or without storage, structural and interconnection review",
  },
  reroof: {
    code: "reroof",
    label: "Re-roof",
    trade: "roofing",
    scope: "Tear-off and replacement of an existing residential roof covering",
  },
  window_replacement: {
    code: "window_replacement",
    label: "Window replacement",
    trade: "roofing",
    scope: "Retrofit windows in existing openings, egress and glazing checks",
  },
};

export const TRADE_LABEL: Record<Trade, string> = {
  hvac: "HVAC",
  plumbing: "Plumbing",
  electrical: "Electrical",
  roofing: "Roofing",
  solar: "Solar",
};

export function isJobType(value: string): value is JobType {
  return (JOB_TYPES as readonly string[]).includes(value);
}

/** Display label for a code; falls back to the raw code so nothing renders blank. */
export function jobTypeLabel(code: string): string {
  return isJobType(code) ? JOB_TYPE_META[code].label : code;
}

export function jobTypesForTrade(trade: Trade): JobTypeMeta[] {
  return JOB_TYPES.map((c) => JOB_TYPE_META[c]).filter((m) => m.trade === trade);
}
