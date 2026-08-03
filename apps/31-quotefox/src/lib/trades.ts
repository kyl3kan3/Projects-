/**
 * Trade knowledge: starter price books, vocabulary, and the demo narration.
 *
 * The starter book is the thing that makes the first walkthrough work at all —
 * a contractor who signs up at 8pm and walks a job at 9am has not imported their
 * rate sheet yet, and an AI draft with nothing to match against produces a page
 * of "needs pricing". These are real, plausible costs at 2026 supply-house
 * prices; they are a starting point the contractor edits, and every seeded row is
 * marked `source = "template"` so it is obvious which numbers are ours and which
 * are theirs.
 *
 * Deliberately absent from every book: crane lifts, asbestos abatement, and
 * anything else priced by a third party per job. Those *should* come back from a
 * walkthrough as `needs pricing` rather than as a guess — which is the behaviour
 * DESIGN.md illustrates ("Crane lift for roof unit — needs pricing").
 */

import type { PriceBookItemKind, Trade, Unit } from "@/db/schema";

export interface StarterItem {
  category: string;
  name: string;
  description?: string;
  kind: PriceBookItemKind;
  unit: Unit;
  unitCostCents: number;
  markupPct?: number;
}

export const TRADE_LABELS: Record<Trade, string> = {
  hvac: "HVAC",
  roofing: "Roofing",
  electrical: "Electrical",
  plumbing: "Plumbing",
  other: "Other trade",
};

export const TRADE_ORDER: Trade[] = ["hvac", "roofing", "electrical", "plumbing", "other"];

/** Whisper prompt bias: words a general transcriber mangles on a jobsite. */
export const TRADE_VOCABULARY: Record<Trade, string[]> = {
  hvac: [
    "condenser", "condensate", "evaporator coil", "air handler", "SEER2", "R-410A", "line set",
    "plenum", "flex duct", "static pressure", "AFUE", "heat pump", "mini-split", "TXV",
    "disconnect", "condenser pad", "return grille", "changeout",
  ],
  roofing: [
    "architectural shingles", "underlayment", "ice and water shield", "drip edge", "ridge vent",
    "step flashing", "pipe boot", "decking", "OSB", "valley", "soffit", "fascia", "tear-off",
    "square", "counter-flashing", "skylight curb",
  ],
  electrical: [
    "load center", "AFCI", "GFCI", "Federal Pacific", "service entrance", "SER cable", "ground rod",
    "bonding", "knob and tube", "romex", "conduit", "EMT", "panel upgrade", "meter base",
    "subpanel", "arc fault", "amperage",
  ],
  plumbing: [
    "PEX", "manifold", "type L copper", "pressure-reducing valve", "sanitary tee", "cleanout",
    "hydro-jetting", "sump pump", "tankless", "anode rod", "expansion tank", "trap primer",
    "backflow preventer", "hose bibb", "shutoff",
  ],
  other: ["scope", "permit", "material", "labor", "haul away", "punch list"],
};

const HVAC: StarterItem[] = [
  { category: "Equipment", name: "Condenser, 3-ton 15.2 SEER2 R-410A", kind: "material", unit: "each", unitCostCents: 195_000 },
  { category: "Equipment", name: "Air handler, 3-ton variable speed", kind: "material", unit: "each", unitCostCents: 165_000 },
  { category: "Equipment", name: "Gas furnace, 80k BTU 96% AFUE", kind: "material", unit: "each", unitCostCents: 142_000 },
  { category: "Equipment", name: "Evaporator coil, 3-ton cased", kind: "material", unit: "each", unitCostCents: 68_000 },
  { category: "Equipment", name: "Mini-split head, 12k BTU wall mount", kind: "material", unit: "each", unitCostCents: 74_000 },
  { category: "Materials", name: "Condenser pad, 36x36 composite", kind: "material", unit: "each", unitCostCents: 8_500 },
  { category: "Materials", name: "Line set, 3/4 x 3/8 insulated", kind: "material", unit: "lf", unitCostCents: 1_450 },
  { category: "Materials", name: "Thermostat, programmable Wi-Fi", kind: "material", unit: "each", unitCostCents: 18_500 },
  { category: "Materials", name: "Flex duct, R-8 insulated", kind: "material", unit: "lf", unitCostCents: 950 },
  { category: "Materials", name: "Return grille, 20x25 filter back", kind: "material", unit: "each", unitCostCents: 6_200 },
  { category: "Materials", name: "Condensate pump with safety switch", kind: "material", unit: "each", unitCostCents: 9_800 },
  { category: "Materials", name: "Disconnect box, 60A fused", kind: "material", unit: "each", unitCostCents: 4_200 },
  { category: "Labor", name: "Install labor, lead technician", kind: "labor", unit: "hour", unitCostCents: 9_500 },
  { category: "Labor", name: "Install labor, apprentice", kind: "labor", unit: "hour", unitCostCents: 6_500 },
  { category: "Labor", name: "Duct sealing, mastic and mesh", kind: "labor", unit: "hour", unitCostCents: 8_500 },
  { category: "Flat rate", name: "System changeout, 3-ton split", description: "Labor for a like-for-like split system changeout, one story.", kind: "flat_rate", unit: "each", unitCostCents: 185_000 },
  { category: "Flat rate", name: "Refrigerant charge and startup", kind: "flat_rate", unit: "each", unitCostCents: 24_000 },
  { category: "Flat rate", name: "Permit filing and inspection", kind: "flat_rate", unit: "each", unitCostCents: 32_500, markupPct: 0 },
];

const ROOFING: StarterItem[] = [
  { category: "Materials", name: "Architectural shingles, 30-year", kind: "material", unit: "sqft", unitCostCents: 165 },
  { category: "Materials", name: "Synthetic underlayment", kind: "material", unit: "sqft", unitCostCents: 38 },
  { category: "Materials", name: "Ice and water shield", kind: "material", unit: "lf", unitCostCents: 285 },
  { category: "Materials", name: "Ridge vent, aluminum", kind: "material", unit: "lf", unitCostCents: 950 },
  { category: "Materials", name: "Drip edge, aluminum", kind: "material", unit: "lf", unitCostCents: 320 },
  { category: "Materials", name: "Step flashing, galvanized", kind: "material", unit: "lf", unitCostCents: 480 },
  { category: "Materials", name: "Pipe boot flashing", kind: "material", unit: "each", unitCostCents: 2_200 },
  { category: "Materials", name: "Decking, 7/16 OSB sheathing", kind: "material", unit: "sqft", unitCostCents: 145 },
  { category: "Labor", name: "Tear-off and haul, one layer", kind: "labor", unit: "sqft", unitCostCents: 95 },
  { category: "Labor", name: "Install labor, architectural shingles", kind: "labor", unit: "sqft", unitCostCents: 185 },
  { category: "Labor", name: "Decking replacement labor", kind: "labor", unit: "sqft", unitCostCents: 120 },
  { category: "Flat rate", name: "Dumpster, 20-yard with haul", kind: "flat_rate", unit: "each", unitCostCents: 62_500 },
  { category: "Flat rate", name: "Chimney re-flash and counter-flash", kind: "flat_rate", unit: "each", unitCostCents: 48_000 },
  { category: "Flat rate", name: "Skylight re-flash kit and install", kind: "flat_rate", unit: "each", unitCostCents: 32_000 },
  { category: "Flat rate", name: "Permit filing", kind: "flat_rate", unit: "each", unitCostCents: 28_500, markupPct: 0 },
];

const ELECTRICAL: StarterItem[] = [
  { category: "Equipment", name: "Load center, 200A main breaker", kind: "material", unit: "each", unitCostCents: 41_500 },
  { category: "Equipment", name: "Meter base, 200A ringless", kind: "material", unit: "each", unitCostCents: 18_500 },
  { category: "Equipment", name: "EV charger, 48A Level 2", kind: "material", unit: "each", unitCostCents: 58_000 },
  { category: "Equipment", name: "Whole-home surge protector", kind: "material", unit: "each", unitCostCents: 28_500 },
  { category: "Materials", name: "Breaker, 20A AFCI", kind: "material", unit: "each", unitCostCents: 6_800 },
  { category: "Materials", name: "Breaker, 50A double pole", kind: "material", unit: "each", unitCostCents: 4_400 },
  { category: "Materials", name: "Service entrance cable, 2/0 SER", kind: "material", unit: "lf", unitCostCents: 1_250 },
  { category: "Materials", name: "Ground rod, 8ft copper-clad", kind: "material", unit: "each", unitCostCents: 2_200 },
  { category: "Materials", name: "GFCI receptacle, 20A", kind: "material", unit: "each", unitCostCents: 2_600 },
  { category: "Materials", name: "Recessed LED downlight, 6 inch", kind: "material", unit: "each", unitCostCents: 3_800 },
  { category: "Materials", name: "Romex, 12/2 NM-B", kind: "material", unit: "lf", unitCostCents: 145 },
  { category: "Labor", name: "Electrician labor, journeyman", kind: "labor", unit: "hour", unitCostCents: 11_000 },
  { category: "Labor", name: "Apprentice labor", kind: "labor", unit: "hour", unitCostCents: 6_800 },
  { category: "Flat rate", name: "Panel upgrade, 200A service", description: "Labor to swap a residential panel and re-terminate branch circuits.", kind: "flat_rate", unit: "each", unitCostCents: 210_000 },
  { category: "Flat rate", name: "Permit and utility coordination", kind: "flat_rate", unit: "each", unitCostCents: 42_500, markupPct: 0 },
  { category: "Flat rate", name: "Dedicated circuit, new run", kind: "flat_rate", unit: "each", unitCostCents: 48_000 },
];

const PLUMBING: StarterItem[] = [
  { category: "Equipment", name: "Water heater, 50-gallon gas", kind: "material", unit: "each", unitCostCents: 92_000 },
  { category: "Equipment", name: "Tankless water heater, 199k BTU", kind: "material", unit: "each", unitCostCents: 165_000 },
  { category: "Equipment", name: "Sump pump, 1/3 hp cast iron", kind: "material", unit: "each", unitCostCents: 26_500 },
  { category: "Equipment", name: "Toilet, comfort height elongated", kind: "material", unit: "each", unitCostCents: 28_500 },
  { category: "Equipment", name: "Kitchen faucet, pull-down", kind: "material", unit: "each", unitCostCents: 22_500 },
  { category: "Materials", name: "PEX-A tubing, 3/4 inch", kind: "material", unit: "lf", unitCostCents: 210 },
  { category: "Materials", name: "PEX manifold, 12-port", kind: "material", unit: "each", unitCostCents: 14_500 },
  { category: "Materials", name: "Copper pipe, 3/4 type L", kind: "material", unit: "lf", unitCostCents: 690 },
  { category: "Materials", name: "Pressure-reducing valve, 3/4", kind: "material", unit: "each", unitCostCents: 12_500 },
  { category: "Materials", name: "Expansion tank, 2-gallon", kind: "material", unit: "each", unitCostCents: 7_400 },
  { category: "Labor", name: "Plumber labor, journeyman", kind: "labor", unit: "hour", unitCostCents: 10_500 },
  { category: "Labor", name: "Helper labor", kind: "labor", unit: "hour", unitCostCents: 6_200 },
  { category: "Flat rate", name: "Water heater changeout", description: "Labor to pull and replace a tank heater, same location.", kind: "flat_rate", unit: "each", unitCostCents: 62_500 },
  { category: "Flat rate", name: "Drain camera inspection", kind: "flat_rate", unit: "each", unitCostCents: 28_500 },
  { category: "Flat rate", name: "Main line hydro-jetting", kind: "flat_rate", unit: "each", unitCostCents: 65_000 },
  { category: "Flat rate", name: "Permit and inspection", kind: "flat_rate", unit: "each", unitCostCents: 24_500, markupPct: 0 },
];

const OTHER: StarterItem[] = [
  { category: "Labor", name: "Lead carpenter labor", kind: "labor", unit: "hour", unitCostCents: 9_800 },
  { category: "Labor", name: "Helper labor", kind: "labor", unit: "hour", unitCostCents: 6_000 },
  { category: "Labor", name: "Demolition and prep", kind: "labor", unit: "hour", unitCostCents: 7_500 },
  { category: "Materials", name: "Lumber, 2x4 SPF stud", kind: "material", unit: "each", unitCostCents: 720 },
  { category: "Materials", name: "Drywall, 1/2 inch sheet", kind: "material", unit: "each", unitCostCents: 1_850 },
  { category: "Materials", name: "Exterior paint, premium", kind: "material", unit: "each", unitCostCents: 6_500 },
  { category: "Flat rate", name: "Dumpster, 10-yard with haul", kind: "flat_rate", unit: "each", unitCostCents: 42_500 },
  { category: "Flat rate", name: "Permit filing", kind: "flat_rate", unit: "each", unitCostCents: 22_500, markupPct: 0 },
];

export const STARTER_BOOKS: Record<Trade, StarterItem[]> = {
  hvac: HVAC,
  roofing: ROOFING,
  electrical: ELECTRICAL,
  plumbing: PLUMBING,
  other: OTHER,
};

export function starterBookFor(trade: Trade): StarterItem[] {
  return STARTER_BOOKS[trade] ?? OTHER;
}

/**
 * The demo narration, used only when no OPENAI_API_KEY is configured: the
 * pipeline cannot transcribe, so instead of inventing a transcript and passing it
 * off as the contractor's own words, it drafts from this clearly-labelled sample
 * plus whatever the tech typed in the capture screen, and the UI says so on the
 * estimate, on the walkthrough, and in the audit log.
 */
export const DEMO_NARRATION: Record<Trade, string> = {
  hvac:
    "Okay, we're at the side of the house looking at the outdoor unit. This condenser is a 2009 unit on R-22, " +
    "the coil is rotted at the bottom and the pad has sunk about two inches so it's sitting in standing water. " +
    "We're replacing it with a three-ton fifteen-two SEER2 condenser and swapping the evaporator coil while we're in there. " +
    "New condenser pad. I want a new thermostat too, that one's the round mercury one. " +
    "The line set runs about twenty-five feet up the side wall and it's kinked near the top, so replace all of it. " +
    "Six hours for the lead tech and six for the apprentice, plus refrigerant charge and startup. " +
    "Permit gets filed with the county. " +
    "I'll also need a crane to set the rooftop unit at the shop next door, so quote that separately once I hear back from the crane company.",
  roofing:
    "Standing in the driveway looking at the front slope. Roof is about twenty-two hundred square feet of architectural shingles, " +
    "one layer, roughly nineteen years old, granule loss all over the south face. Tear off the one layer and haul it. " +
    "Full synthetic underlayment across all twenty-two hundred square feet. " +
    "Ice and water shield on the eaves, that's about a hundred and forty linear feet. " +
    "New aluminum drip edge all the way around, call it two hundred and ten feet. " +
    "Ridge vent replacement, forty-two feet. Three pipe boots. " +
    "There's soft decking above the garage, maybe a hundred and twenty square feet of OSB sheathing to replace. " +
    "The chimney needs a re-flash and counter-flash. Twenty-yard dumpster on the driveway, and the permit gets filed with the city. " +
    "Also there's a satellite dish mount through the deck that somebody needs to come remove — not my scope, price it out separately.",
  electrical:
    "Alright, we're in the garage at the panel. This is a Federal Pacific Stab-Lok, sixty-amp, and it's got double-taps on four breakers. " +
    "Insurance is going to want this gone. We're doing a full two-hundred-amp service upgrade: new load center, new meter base, " +
    "two ground rods, and about thirty feet of two-aught SER from the meter to the panel. " +
    "Twelve twenty-amp AFCI breakers and one fifty-amp double pole for the range. " +
    "Add a whole-home surge protector while we're in there. Two GFCI receptacles in the garage — code requires a GFCI within six feet of the sink. " +
    "Eight hours journeyman, four hours apprentice. Permit and utility coordination for the disconnect. " +
    "The utility's going to want the mast raised and that's on them, but there's also a knob-and-tube run in the attic I can't price until I open the ceiling.",
  plumbing:
    "We're in the basement at the water heater. Fifty-gallon gas unit, 2011, and the top of the tank is weeping at the nipple — it's done. " +
    "Replace it with a fifty-gallon gas, new expansion tank, and while the water's off I want a new three-quarter pressure-reducing valve " +
    "because the static pressure is reading ninety-two psi. " +
    "Four hours journeyman, two hours helper. About eighteen feet of three-quarter PEX to re-run the cold line around the beam. " +
    "Permit and inspection with the township. " +
    "The floor drain isn't taking water so I want a camera inspection, and if there's a break under the slab that's a separate number I can't give you today.",
  other:
    "Walking the exterior now. Front elevation needs prep and two coats, roughly nine hundred square feet of siding. " +
    "Two windows have rotted sills that need to be cut out and rebuilt — call it eight hours of carpenter time plus lumber. " +
    "Ten-yard dumpster for the demo. Permit filed with the village. " +
    "The chimney crown is cracked and that's a mason's job, so it gets priced separately.",
};
