/**
 * src/db/factors.ts
 *
 * The bundled emission-factor sets, as data.
 *
 * ## Read this before trusting a number
 *
 * These rows are a **transcription of the published sets, kept in the repository so
 * the product has no runtime dependency on a third-party factor API**. Each carries
 * the publisher, table, vintage and — where the published unit differs from the
 * canonical one — the conversion applied. Before a customer's report leaves the
 * building on a real engagement, re-run `npm run db:seed-factors` against the
 * current published CSVs (EPA GHG Emission Factors Hub, eGRID, DEFRA/DESNZ
 * conversion factors, USEEIO). Factor vintages change annually and a stale factor is
 * the single most common defect in an SMB footprint.
 *
 * ## Conventions
 *
 * - Published values are kept in the unit they were published in (lb/MWh,
 *   kgCO2e/US gallon, kgCO2e/mmBtu) and converted here, once, so the citation can
 *   state the conversion instead of hiding it.
 * - `kgco2ePerUnitMicro` is kgCO2e per canonical unit × 1 000 000.
 * - Nothing in this file is ever mutated in place. A new vintage is a new row; the
 *   unique index is (factor_set, category, region, vintage).
 */

import type { FactorSet, Scope } from "./schema";

export interface FactorSeed {
  factorSet: FactorSet;
  category: string;
  region: string;
  unit: string;
  kgco2ePerUnitMicro: number;
  vintage: string;
  citation: string;
  scope: Scope;
  label: string;
}

/* ------------------------------------------------------------- conversions --- */

/** 1 kWh = 3 412.14 BTU = 0.00341214 mmBtu. */
const KWH_PER_MMBTU = 293.071;
/** 1 US gallon = 3.785412 L. */
const US_GALLON_L = 3.785412;
/** 1 lb = 0.45359237 kg. */
const LB_KG = 0.45359237;

const micro = (v: number) => Math.round(v * 1_000_000);

/* ------------------------------------------------- eGRID subregion factors --- */

/**
 * eGRID subregion total output emission rates, lb CO2e/MWh.
 *
 * Source: US EPA eGRID2022, published January 2024 — the vintage a 2025 reporting
 * year is expected to use, since eGRID lags by two years. Region codes are the eGRID
 * subregion acronyms a US site is assigned by ZIP code.
 */
const EGRID_LB_PER_MWH: { region: string; label: string; lbPerMwh: number }[] = [
  { region: "AZNM", label: "WECC Southwest", lbPerMwh: 776 },
  { region: "CAMX", label: "WECC California", lbPerMwh: 511 },
  { region: "ERCT", label: "ERCOT All", lbPerMwh: 794 },
  { region: "FRCC", label: "FRCC All (Florida)", lbPerMwh: 830 },
  { region: "MROE", label: "MRO East", lbPerMwh: 1_323 },
  { region: "MROW", label: "MRO West", lbPerMwh: 843 },
  { region: "NEWE", label: "NPCC New England", lbPerMwh: 531 },
  { region: "NWPP", label: "WECC Northwest", lbPerMwh: 613 },
  { region: "NYCW", label: "NPCC NYC/Westchester", lbPerMwh: 733 },
  { region: "NYLI", label: "NPCC Long Island", lbPerMwh: 1_155 },
  { region: "NYUP", label: "NPCC Upstate NY", lbPerMwh: 250 },
  { region: "RFCE", label: "RFC East", lbPerMwh: 626 },
  { region: "RFCM", label: "RFC Michigan", lbPerMwh: 1_153 },
  { region: "RFCW", label: "RFC West", lbPerMwh: 1_000 },
  { region: "RMPA", label: "WECC Rockies", lbPerMwh: 1_061 },
  { region: "SPNO", label: "SPP North", lbPerMwh: 1_088 },
  { region: "SPSO", label: "SPP South", lbPerMwh: 941 },
  { region: "SRMV", label: "SERC Mississippi Valley", lbPerMwh: 826 },
  { region: "SRMW", label: "SERC Midwest", lbPerMwh: 1_461 },
  { region: "SRSO", label: "SERC South", lbPerMwh: 872 },
  { region: "SRTV", label: "SERC Tennessee Valley", lbPerMwh: 894 },
  { region: "SRVC", label: "SERC Virginia/Carolina", lbPerMwh: 636 },
  { region: "US", label: "US national average", lbPerMwh: 823 },
];

/** eGRID subregions, for the site form's region picker. */
export const EGRID_REGIONS = EGRID_LB_PER_MWH.map((r) => ({ code: r.region, label: r.label }));

const egridFactors: FactorSeed[] = EGRID_LB_PER_MWH.map((r) => ({
  factorSet: "egrid_2024",
  category: "electricity_kwh",
  region: r.region,
  unit: "kWh",
  kgco2ePerUnitMicro: micro((r.lbPerMwh * LB_KG) / 1000),
  vintage: "eGRID2022 (published 2024)",
  citation: `US EPA eGRID2022, subregion ${r.region} (${r.label}), total output CO2e rate ${r.lbPerMwh} lb/MWh, converted at 0.45359237 kg/lb`,
  scope: "2_location",
  label: `eGRID ${r.region}`,
}));

/* ------------------------------------------------------------ fuel factors --- */

/**
 * EPA stationary/mobile combustion factors for US sites.
 *
 * Source: US EPA "Emission Factors for Greenhouse Gas Inventories" (2025 release),
 * Table 1 (stationary combustion) and Table 2 (mobile combustion), CO2 + CH4 + N2O
 * combined at AR5 100-year GWPs (CH4 28, N2O 265).
 */
const epaFuel: FactorSeed[] = [
  {
    factorSet: "epa_2025",
    category: "natural_gas_kwh",
    region: "US",
    unit: "kWh",
    kgco2ePerUnitMicro: micro(53.11 / KWH_PER_MMBTU),
    vintage: "2025",
    citation:
      "US EPA Emission Factors for GHG Inventories (2025), Table 1 natural gas 53.11 kgCO2e/mmBtu (HHV), converted at 293.071 kWh/mmBtu",
    scope: "1",
    label: "EPA natural gas",
  },
  {
    factorSet: "epa_2025",
    category: "diesel_l",
    region: "US",
    unit: "L",
    kgco2ePerUnitMicro: micro(10.2427 / US_GALLON_L),
    vintage: "2025",
    citation:
      "US EPA Emission Factors for GHG Inventories (2025), distillate fuel oil No. 2 10.2427 kgCO2e/US gal, converted at 3.785412 L/gal",
    scope: "1",
    label: "EPA diesel",
  },
  {
    factorSet: "epa_2025",
    category: "petrol_l",
    region: "US",
    unit: "L",
    kgco2ePerUnitMicro: micro(8.8118 / US_GALLON_L),
    vintage: "2025",
    citation:
      "US EPA Emission Factors for GHG Inventories (2025), motor gasoline 8.8118 kgCO2e/US gal, converted at 3.785412 L/gal",
    scope: "1",
    label: "EPA gasoline",
  },
  {
    factorSet: "epa_2025",
    category: "heating_oil_l",
    region: "US",
    unit: "L",
    kgco2ePerUnitMicro: micro(10.2427 / US_GALLON_L),
    vintage: "2025",
    citation:
      "US EPA Emission Factors for GHG Inventories (2025), heating oil is distillate No. 2 at 10.2427 kgCO2e/US gal, converted at 3.785412 L/gal",
    scope: "1",
    label: "EPA heating oil",
  },
  {
    factorSet: "epa_2025",
    category: "propane_l",
    region: "US",
    unit: "L",
    kgco2ePerUnitMicro: micro(5.74 / US_GALLON_L),
    vintage: "2025",
    citation:
      "US EPA Emission Factors for GHG Inventories (2025), propane 5.74 kgCO2e/US gal, converted at 3.785412 L/gal",
    scope: "1",
    label: "EPA propane",
  },
];

/**
 * DEFRA/DESNZ factors for UK sites — published per kWh (gross CV) and per litre, so
 * no conversion is needed. Liquid fuels are the average biofuel blend, which is what
 * a UK pump actually dispenses.
 */
const defraFuel: FactorSeed[] = [
  {
    factorSet: "defra_2025",
    category: "natural_gas_kwh",
    region: "GB",
    unit: "kWh",
    kgco2ePerUnitMicro: 182_900,
    vintage: "2025",
    citation:
      "UK DESNZ/DEFRA GHG conversion factors 2025, gaseous fuels — natural gas, 0.18290 kgCO2e/kWh (gross CV)",
    scope: "1",
    label: "DEFRA natural gas",
  },
  {
    factorSet: "defra_2025",
    category: "diesel_l",
    region: "GB",
    unit: "L",
    kgco2ePerUnitMicro: 2_512_330,
    vintage: "2025",
    citation:
      "UK DESNZ/DEFRA GHG conversion factors 2025, liquid fuels — diesel (average biofuel blend), 2.51233 kgCO2e/litre",
    scope: "1",
    label: "DEFRA diesel",
  },
  {
    factorSet: "defra_2025",
    category: "petrol_l",
    region: "GB",
    unit: "L",
    kgco2ePerUnitMicro: 2_168_020,
    vintage: "2025",
    citation:
      "UK DESNZ/DEFRA GHG conversion factors 2025, liquid fuels — petrol (average biofuel blend), 2.16802 kgCO2e/litre",
    scope: "1",
    label: "DEFRA petrol",
  },
  {
    factorSet: "defra_2025",
    category: "heating_oil_l",
    region: "GB",
    unit: "L",
    kgco2ePerUnitMicro: 2_540_170,
    vintage: "2025",
    citation:
      "UK DESNZ/DEFRA GHG conversion factors 2025, liquid fuels — burning oil (kerosene), 2.54017 kgCO2e/litre",
    scope: "1",
    label: "DEFRA heating oil",
  },
  {
    factorSet: "defra_2025",
    category: "propane_l",
    region: "GB",
    unit: "L",
    kgco2ePerUnitMicro: 1_555_370,
    vintage: "2025",
    citation:
      "UK DESNZ/DEFRA GHG conversion factors 2025, liquid fuels — LPG, 1.55537 kgCO2e/litre",
    scope: "1",
    label: "DEFRA LPG",
  },
  {
    factorSet: "defra_2025",
    category: "electricity_kwh",
    region: "GB",
    unit: "kWh",
    kgco2ePerUnitMicro: 207_050,
    vintage: "2025",
    citation:
      "UK DESNZ/DEFRA GHG conversion factors 2025, UK electricity — generation, 0.20705 kgCO2e/kWh",
    scope: "2_location",
    label: "DEFRA UK grid",
  },
];

/**
 * Contractual instruments. One row, one value, and the value is zero — a supplier
 * renewable contract or a retired EAC is claimed at zero gCO2e for the covered MWh
 * under GHG Protocol Scope 2 market-based accounting. The instrument itself is
 * recorded on the site so the report can name it.
 */
const contractual: FactorSeed[] = [
  {
    factorSet: "contractual",
    category: "electricity_kwh",
    region: "GLOBAL",
    unit: "kWh",
    kgco2ePerUnitMicro: 0,
    vintage: "n/a",
    citation:
      "GHG Protocol Scope 2 Guidance, market-based method: electricity covered by a contractual instrument (supplier renewable tariff or retired energy attribute certificate) is reported at zero gCO2e for the covered volume",
    scope: "2_market",
    label: "Contractual instrument",
  },
];

/* ----------------------------------------------------- USEEIO spend factors --- */

/**
 * Spend-based screening factors, kgCO2e per USD of purchaser-price spend.
 *
 * Source: US EPA USEEIO v2.0 supply-chain GHG emission factors (2018 USD, purchaser
 * price, including margins). Rounded to two decimals, which is well inside the
 * uncertainty of a spend-based screen — these figures are an order-of-magnitude
 * estimate by construction, and the report says so in those words.
 *
 * `alreadyCounted` categories exist so a GL line for electricity or vehicle fuel can
 * be *recognised* and then excluded with a stated reason, instead of quietly
 * double-counting what Scope 1 and 2 already measured from the bills.
 */
export interface EeioCategory {
  slug: string;
  label: string;
  kgPerUsd: number;
  /** Keywords the deterministic classifier matches on, lowercase. */
  keywords: string[];
  /** True when the spend is already inside Scope 1 or 2 and must not be added again. */
  alreadyCounted?: boolean;
}

export const EEIO_CATEGORIES: EeioCategory[] = [
  { slug: "office_supplies", label: "Office supplies & paper", kgPerUsd: 0.28, keywords: ["office supplies", "stationery", "staples", "paper", "printer", "toner", "ink cartridge"] },
  { slug: "computer_electronics", label: "Computers & electronics", kgPerUsd: 0.32, keywords: ["laptop", "computer", "monitor", "dell", "lenovo", "apple", "hardware", "electronics", "server"] },
  { slug: "software_it_services", label: "Software & IT services", kgPerUsd: 0.13, keywords: ["software", "saas", "subscription", "hosting", "aws", "azure", "licence", "license", "it support"] },
  { slug: "professional_services", label: "Professional & technical services", kgPerUsd: 0.13, keywords: ["consulting", "consultant", "engineering services", "design services", "recruiting", "agency fee"] },
  { slug: "legal_accounting", label: "Legal & accounting", kgPerUsd: 0.11, keywords: ["legal", "attorney", "solicitor", "accounting", "audit fee", "bookkeeping", "cpa"] },
  { slug: "advertising_marketing", label: "Advertising & marketing", kgPerUsd: 0.16, keywords: ["advertising", "marketing", "google ads", "trade show", "print ad", "sponsorship"] },
  { slug: "freight_trucking", label: "Freight & trucking", kgPerUsd: 0.86, keywords: ["freight", "trucking", "ltl", "shipping", "carrier", "logistics", "xpo", "old dominion"] },
  { slug: "air_transport", label: "Air transport & courier air", kgPerUsd: 1.06, keywords: ["air freight", "airline", "airfare", "flight", "delta", "united air"] },
  { slug: "postal_courier", label: "Parcel & courier", kgPerUsd: 0.55, keywords: ["ups", "fedex", "dhl", "usps", "royal mail", "courier", "parcel", "postage"] },
  { slug: "warehousing", label: "Warehousing & storage", kgPerUsd: 0.31, keywords: ["warehouse", "storage", "3pl", "fulfilment", "fulfillment"] },
  { slug: "machinery_equipment", label: "Machinery & equipment", kgPerUsd: 0.42, keywords: ["machinery", "machine", "equipment purchase", "cnc", "compressor", "forklift", "pump"] },
  { slug: "fabricated_metal", label: "Fabricated metal products", kgPerUsd: 0.61, keywords: ["fastener", "bracket", "weldment", "machined part", "sheet metal", "fabrication"] },
  { slug: "iron_steel", label: "Iron & steel mill products", kgPerUsd: 1.85, keywords: ["steel", "bar stock", "billet", "aluminium", "aluminum", "iron", "metal stock"] },
  { slug: "plastics_rubber", label: "Plastics & rubber products", kgPerUsd: 0.72, keywords: ["plastic", "resin", "polymer", "rubber", "gasket", "moulding", "molding"] },
  { slug: "paper_packaging", label: "Paper & packaging", kgPerUsd: 0.71, keywords: ["packaging", "corrugated", "carton", "box", "label stock", "pallet"] },
  { slug: "chemicals", label: "Chemicals & industrial gases", kgPerUsd: 0.83, keywords: ["chemical", "solvent", "adhesive", "coating", "lubricant", "argon", "nitrogen", "paint"] },
  { slug: "food_beverage", label: "Food & beverage", kgPerUsd: 0.63, keywords: ["catering", "food", "beverage", "coffee", "produce", "ingredient", "dairy"] },
  { slug: "textiles_apparel", label: "Textiles & apparel", kgPerUsd: 0.53, keywords: ["uniform", "workwear", "apparel", "textile", "glove", "ppe"] },
  { slug: "construction_maintenance", label: "Construction & building maintenance", kgPerUsd: 0.4, keywords: ["construction", "contractor", "hvac service", "plumbing", "electrical work", "repair building", "janitorial", "cleaning service", "landscaping"] },
  { slug: "waste_management", label: "Waste & recycling services", kgPerUsd: 0.6, keywords: ["waste", "dumpster", "recycling", "skip hire", "disposal"] },
  { slug: "water_wastewater", label: "Water & wastewater", kgPerUsd: 0.53, keywords: ["water utility", "water rates", "sewer", "wastewater"] },
  { slug: "telecom", label: "Telecom & internet", kgPerUsd: 0.15, keywords: ["telecom", "internet", "broadband", "mobile phone", "verizon", "at&t", "vodafone"] },
  { slug: "insurance_finance", label: "Insurance & financial services", kgPerUsd: 0.09, keywords: ["insurance", "bank fee", "merchant fee", "interest", "finance charge", "broker"] },
  { slug: "real_estate_leasing", label: "Rent & leasing", kgPerUsd: 0.14, keywords: ["rent", "lease", "property", "landlord"] },
  { slug: "equipment_rental", label: "Equipment rental", kgPerUsd: 0.18, keywords: ["equipment rental", "united rentals", "hire", "plant hire"] },
  { slug: "travel_accommodation", label: "Travel & accommodation", kgPerUsd: 0.36, keywords: ["hotel", "lodging", "travel", "car rental", "per diem", "rail ticket"] },
  { slug: "other_goods", label: "Other manufactured goods", kgPerUsd: 0.55, keywords: ["supplies", "parts", "components", "misc goods", "tools", "hardware store"] },
  // --- recognised, then excluded: already inside Scope 1 / 2 ---
  { slug: "purchased_electricity", label: "Purchased electricity (in Scope 2)", kgPerUsd: 1.55, keywords: ["electric", "electricity", "power company", "con edison", "coned", "pg&e", "duke energy", "national grid"], alreadyCounted: true },
  { slug: "purchased_gas", label: "Purchased natural gas (in Scope 1)", kgPerUsd: 1.2, keywords: ["natural gas", "gas utility", "gas company", "peoples gas", "southwest gas", "british gas"], alreadyCounted: true },
  { slug: "vehicle_fuel", label: "Vehicle & heating fuel (in Scope 1)", kgPerUsd: 1.1, keywords: ["fuel", "diesel", "gasoline", "petrol", "shell", "bp ", "chevron", "propane", "heating oil"], alreadyCounted: true },
];

export const EEIO_BY_SLUG = new Map(EEIO_CATEGORIES.map((c) => [c.slug, c]));

const eeioFactors: FactorSeed[] = EEIO_CATEGORIES.map((c) => ({
  factorSet: "useeio_v2",
  category: c.slug,
  region: "US",
  unit: "USD",
  kgco2ePerUnitMicro: micro(c.kgPerUsd),
  vintage: "USEEIO v2.0 (2018 USD, purchaser price)",
  citation: `US EPA USEEIO v2.0 supply-chain GHG factor, "${c.label}", ${c.kgPerUsd.toFixed(2)} kgCO2e per 2018 USD (purchaser price, incl. margins)`,
  scope: "3_spend",
  label: c.label,
}));

/* ------------------------------------------------------------------ export --- */

export const FACTOR_SEEDS: FactorSeed[] = [
  ...egridFactors,
  ...epaFuel,
  ...defraFuel,
  ...contractual,
  ...eeioFactors,
];

/** Countries the site form offers, and which fuel factor set each one selects. */
export const COUNTRIES = [
  { code: "US", label: "United States", fuelSet: "epa_2025" as FactorSet },
  { code: "GB", label: "United Kingdom", fuelSet: "defra_2025" as FactorSet },
] as const;

export function fuelFactorSetFor(country: string): FactorSet {
  return country === "GB" ? "defra_2025" : "epa_2025";
}

/** Grid regions offered for a country. UK has one national factor. */
export function gridRegionsFor(country: string): { code: string; label: string }[] {
  if (country === "GB") return [{ code: "GB", label: "UK national grid" }];
  return EGRID_REGIONS;
}
