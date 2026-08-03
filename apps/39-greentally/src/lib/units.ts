/**
 * Units and the conversions into them.
 *
 * The engine only ever multiplies a canonical quantity by a factor expressed in the
 * same canonical unit, so every unit a utility bill might print has to be converted
 * exactly once, here, on the way in. Electricity and gas become kWh; liquid fuels
 * become litres.
 *
 * Two rules this file exists to enforce:
 *
 *  - **A unit we do not recognise is a failure, not a guess.** `convertToCanonical`
 *    returns null and the document goes to review. Silently treating 4,182 CCF as
 *    4,182 kWh understates a footprint by a factor of thirty.
 *  - **Quantities are integers in thousandths** (`quantityMilli`), so a converted
 *    quantity is rounded once here and never again.
 */

import type { ActivityCategory } from "@/db/schema";

export const CANONICAL_UNIT: Record<ActivityCategory, "kWh" | "L"> = {
  electricity_kwh: "kWh",
  natural_gas_kwh: "kWh",
  diesel_l: "L",
  petrol_l: "L",
  heating_oil_l: "L",
  propane_l: "L",
};

export const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  electricity_kwh: "Purchased electricity",
  natural_gas_kwh: "Natural gas",
  diesel_l: "Diesel",
  petrol_l: "Petrol / gasoline",
  heating_oil_l: "Heating oil",
  propane_l: "Propane / LPG",
};

/** Which scope a category lands in. Electricity is the only Scope 2 activity. */
export function scopeOf(category: ActivityCategory): "1" | "2" {
  return category === "electricity_kwh" ? "2" : "1";
}

/**
 * Conversion constants, with the source of each.
 *
 *  - 1 therm = 105.4804 MJ = 29.3001 kWh (exactly 100 000 BTU, IT BTU = 1055.06 J)
 *  - 1 CCF of pipeline natural gas = 1.037 therms (EIA average heat content)
 *  - 1 MCF = 10 CCF
 *  - 1 m³ of natural gas = 38.0 MJ gross CV = 10.5556 kWh (typical UK NTS gas)
 *  - 1 US gallon = 3.785412 L
 *  - 1 imperial gallon = 4.546092 L
 */
const THERM_KWH = 29.3001;
const CCF_THERMS = 1.037;
const M3_GAS_KWH = 10.5556;
const US_GALLON_L = 3.785412;
const IMP_GALLON_L = 4.546092;

interface UnitDef {
  /** Multiply the printed quantity by this to reach the canonical unit. */
  factor: number;
  canonical: "kWh" | "L";
  /** Canonical spelling shown back to the operator. */
  display: string;
}

const ENERGY_UNITS: Record<string, UnitDef> = {
  kwh: { factor: 1, canonical: "kWh", display: "kWh" },
  "kw h": { factor: 1, canonical: "kWh", display: "kWh" },
  kilowatthour: { factor: 1, canonical: "kWh", display: "kWh" },
  kilowatthours: { factor: 1, canonical: "kWh", display: "kWh" },
  mwh: { factor: 1000, canonical: "kWh", display: "MWh" },
  gj: { factor: 277.778, canonical: "kWh", display: "GJ" },
  therm: { factor: THERM_KWH, canonical: "kWh", display: "therms" },
  therms: { factor: THERM_KWH, canonical: "kWh", display: "therms" },
  thm: { factor: THERM_KWH, canonical: "kWh", display: "therms" },
  dth: { factor: THERM_KWH * 10, canonical: "kWh", display: "Dth" },
  mmbtu: { factor: THERM_KWH * 10, canonical: "kWh", display: "MMBtu" },
  ccf: { factor: CCF_THERMS * THERM_KWH, canonical: "kWh", display: "CCF" },
  hcf: { factor: CCF_THERMS * THERM_KWH, canonical: "kWh", display: "CCF" },
  mcf: { factor: CCF_THERMS * THERM_KWH * 10, canonical: "kWh", display: "MCF" },
  m3: { factor: M3_GAS_KWH, canonical: "kWh", display: "m³" },
  "cubic metre": { factor: M3_GAS_KWH, canonical: "kWh", display: "m³" },
  "cubic meter": { factor: M3_GAS_KWH, canonical: "kWh", display: "m³" },
  "cubic metres": { factor: M3_GAS_KWH, canonical: "kWh", display: "m³" },
};

const VOLUME_UNITS: Record<string, UnitDef> = {
  l: { factor: 1, canonical: "L", display: "L" },
  litre: { factor: 1, canonical: "L", display: "L" },
  litres: { factor: 1, canonical: "L", display: "L" },
  liter: { factor: 1, canonical: "L", display: "L" },
  liters: { factor: 1, canonical: "L", display: "L" },
  gal: { factor: US_GALLON_L, canonical: "L", display: "US gal" },
  gallon: { factor: US_GALLON_L, canonical: "L", display: "US gal" },
  gallons: { factor: US_GALLON_L, canonical: "L", display: "US gal" },
  "us gal": { factor: US_GALLON_L, canonical: "L", display: "US gal" },
  "imp gal": { factor: IMP_GALLON_L, canonical: "L", display: "imp gal" },
};

export function normalizeUnitKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/³/g, "3")
    .replace(/[.\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Conversion {
  quantityMilli: number;
  canonicalUnit: "kWh" | "L";
  /** The printed unit, spelled canonically for the review panel. */
  sourceUnitDisplay: string;
}

/**
 * Convert a printed quantity + unit into the canonical unit for a category.
 *
 * Returns null when the unit is unknown for that category — including the case that
 * matters most, a volume unit on an electricity bill.
 */
export function convertToCanonical(
  category: ActivityCategory,
  quantity: number,
  unit: string,
): Conversion | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const key = normalizeUnitKey(unit);
  const want = CANONICAL_UNIT[category];
  const def = want === "kWh" ? ENERGY_UNITS[key] : VOLUME_UNITS[key];
  if (!def) return null;
  if (def.canonical !== want) return null;
  return {
    quantityMilli: Math.round(quantity * def.factor * 1000),
    canonicalUnit: def.canonical,
    sourceUnitDisplay: def.display,
  };
}

/** Every unit spelling the review panel offers for a category, in printing order. */
export function unitOptions(category: ActivityCategory): string[] {
  return CANONICAL_UNIT[category] === "kWh"
    ? ["kWh", "MWh", "therms", "CCF", "MCF", "m³", "MMBtu", "GJ"]
    : ["L", "US gal", "imp gal"];
}

/* ------------------------------------------------------------- formatting --- */

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });

/** 41 882 000 → "41,882". Thousandths are dropped: no bill is that precise. */
export function formatQuantityMilli(quantityMilli: number, decimals = 0): string {
  return nf(decimals, decimals).format(quantityMilli / 1000);
}

/** Grams → tonnes with one decimal: 128 400 000 → "128.4". */
export function formatTonnes(gco2e: number, decimals = 1): string {
  return nf(decimals, decimals).format(gco2e / 1_000_000);
}

/** Grams → kg with no decimal, for small per-line figures. */
export function formatKg(gco2e: number): string {
  return nf(0, 0).format(Math.round(gco2e / 1000));
}

/** 383000 → "0.383". A factor is printed at the precision it was published. */
export function formatFactorMicro(micro: number): string {
  const v = micro / 1_000_000;
  if (v === 0) return "0";
  if (v < 0.01) return nf(6, 6).format(v);
  if (v < 1) return nf(3, 4).format(v).replace(/0+$/, "").replace(/\.$/, "");
  return nf(2, 4).format(v).replace(/0+$/, "").replace(/\.$/, "");
}

/** Cents → "$1,284.50". */
export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Cents → "$1.3M" / "$482K" / "$620".
 *
 * Below a thousand the compact notation has no suffix to justify a decimal, and
 * `Intl`'s compact form still prints "$620.0", which reads like a rounding artefact in a
 * table of money. Under $1,000 it falls back to whole dollars.
 */
export function formatCentsCompact(cents: number, currency = "USD"): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) < 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(dollars);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(dollars);
}

/** Basis points → "99%" (never rounds 9 950 up to 100%). */
export function formatConfidenceBp(bp: number): string {
  const pct = bp / 100;
  return `${Math.floor(pct)}%`;
}
