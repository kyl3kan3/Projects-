/**
 * CSI MasterFormat divisions, trimmed to the ones a small commercial GC actually
 * buys out. The full 50-division list is technically correct and practically
 * useless in a picker on a phone.
 *
 * Codes are strings because "03" is not 3 — a division code is a label, and the
 * moment it becomes a number it sorts wrong and prints wrong.
 */

export interface Division {
  code: string;
  label: string;
  /** Typical bid-form lines, used to seed a new package's form. */
  seedLines: string[];
}

export const DIVISIONS: Division[] = [
  {
    code: "02",
    label: "Existing conditions & demolition",
    seedLines: [
      "Selective interior demolition",
      "Abatement coordination and monitoring",
      "Dumpsters and debris removal",
      "Protection of adjacent finishes",
    ],
  },
  {
    code: "03",
    label: "Concrete",
    seedLines: [
      "Slab-on-grade, 4in with WWF",
      "Footings and foundation walls",
      "Housekeeping pads",
      "Saw cutting and patching",
    ],
  },
  {
    code: "05",
    label: "Metals",
    seedLines: [
      "Structural steel columns and beams",
      "Steel stair and railing",
      "Miscellaneous metals and lintels",
      "Shop drawings and engineering",
    ],
  },
  {
    code: "06",
    label: "Wood, plastics & composites",
    seedLines: [
      "Rough carpentry and blocking",
      "Plastic laminate casework",
      "Solid surface countertops",
      "Millwork installation",
    ],
  },
  {
    code: "07",
    label: "Thermal & moisture protection",
    seedLines: [
      "TPO roof system and flashing",
      "Wall insulation and air barrier",
      "Sealants and caulking",
      "Roof warranty (20 yr NDL)",
    ],
  },
  {
    code: "08",
    label: "Openings",
    seedLines: [
      "Hollow metal frames and doors",
      "Aluminium storefront and glazing",
      "Finish hardware per schedule",
      "Overhead coiling door",
    ],
  },
  {
    code: "09",
    label: "Finishes",
    seedLines: [
      "Metal stud framing and drywall",
      "Level 4 finish and priming",
      "Acoustical ceiling grid and tile",
      "Resilient flooring and base",
      "Painting, walls and ceilings",
    ],
  },
  {
    code: "10",
    label: "Specialties",
    seedLines: [
      "Toilet partitions and accessories",
      "Fire extinguishers and cabinets",
      "Signage per code",
      "Lockers",
    ],
  },
  {
    code: "21",
    label: "Fire suppression",
    seedLines: [
      "Wet sprinkler mains and branches",
      "Heads and escutcheons",
      "Fire department connection",
      "Hydraulic calculations and permits",
    ],
  },
  {
    code: "22",
    label: "Plumbing",
    seedLines: [
      "Sanitary waste and vent",
      "Domestic water distribution",
      "Fixtures per schedule",
      "Water heater and recirculation",
      "Gas piping",
    ],
  },
  {
    code: "23",
    label: "Mechanical / HVAC",
    seedLines: [
      "Rooftop units and curbs",
      "Ductwork and insulation",
      "VAV boxes and controls",
      "Test, adjust and balance",
      "Exhaust fans",
    ],
  },
  {
    code: "26",
    label: "Electrical",
    seedLines: [
      "Temporary power and distribution",
      "Panelboards and feeders",
      "Branch wiring and devices",
      "Light fixtures (owner-furnished)",
      "Fire alarm rough-in",
    ],
  },
  {
    code: "27",
    label: "Communications",
    seedLines: [
      "Data cabling, Cat6A",
      "Rack, patch panels and termination",
      "Testing and certification",
      "Pathways and J-hooks",
    ],
  },
  {
    code: "28",
    label: "Electronic safety & security",
    seedLines: [
      "Access control at exterior doors",
      "Camera system and NVR",
      "Fire alarm devices and programming",
      "Commissioning with AHJ",
    ],
  },
  {
    code: "31",
    label: "Earthwork",
    seedLines: [
      "Mass excavation and haul-off",
      "Structural fill and compaction",
      "Erosion control and SWPPP",
      "Shoring",
    ],
  },
  {
    code: "32",
    label: "Exterior improvements",
    seedLines: [
      "Asphalt paving and striping",
      "Concrete curb, walk and ADA ramps",
      "Landscaping and irrigation",
      "Site fencing and gates",
    ],
  },
  {
    code: "33",
    label: "Utilities",
    seedLines: [
      "Storm drainage and structures",
      "Sanitary sewer lateral",
      "Domestic and fire water service",
      "Utility company coordination fees",
    ],
  },
];

const BY_CODE = new Map(DIVISIONS.map((d) => [d.code, d]));

export function division(code: string): Division | null {
  return BY_CODE.get(code.trim()) ?? null;
}

export function divisionLabel(code: string): string {
  return BY_CODE.get(code.trim())?.label ?? `Division ${code}`;
}

/** `26 · ELECTRICAL` — the mono trade label on a package header. */
export function divisionStamp(code: string): string {
  return `${code} · ${divisionLabel(code).toUpperCase()}`;
}

/**
 * Accept a division from a spreadsheet cell: "26", "Div 26", "26 - Electrical",
 * "electrical", "HVAC". Returns the code or null — never a guess that would file a
 * sub under the wrong trade.
 */
export function parseDivision(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const digits = /(\d{1,2})/.exec(raw);
  if (digits) {
    const code = digits[1].padStart(2, "0");
    if (BY_CODE.has(code)) return code;
  }

  const lower = raw.toLowerCase();
  const ALIASES: Record<string, string> = {
    hvac: "23",
    mechanical: "23",
    mech: "23",
    electric: "26",
    electrical: "26",
    plumbing: "22",
    plumber: "22",
    sprinkler: "21",
    "fire sprinkler": "21",
    "fire protection": "21",
    drywall: "09",
    painting: "09",
    finishes: "09",
    flooring: "09",
    concrete: "03",
    steel: "05",
    metals: "05",
    roofing: "07",
    glazing: "08",
    doors: "08",
    demolition: "02",
    demo: "02",
    earthwork: "31",
    sitework: "32",
    paving: "32",
    landscaping: "32",
    utilities: "33",
    "low voltage": "27",
    data: "27",
    security: "28",
    carpentry: "06",
    millwork: "06",
    specialties: "10",
  };
  if (ALIASES[lower]) return ALIASES[lower];
  for (const [needle, code] of Object.entries(ALIASES)) {
    if (lower.includes(needle)) return code;
  }
  const byLabel = DIVISIONS.find((d) => d.label.toLowerCase().includes(lower) && lower.length >= 4);
  return byLabel?.code ?? null;
}
