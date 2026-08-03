/**
 * src/lib/jurisdictions.ts
 *
 * IFTA jurisdictions and which ones touch. The adjacency table is what lets the
 * quarter view say "you have Texas then Ohio with nothing between — 900 miles
 * of Arkansas, Tennessee and Kentucky are missing" instead of quietly filing a
 * return that is wrong.
 *
 * Gaps are flagged, never auto-filled. Inventing miles for a state a truck
 * probably crossed is the one thing an IFTA tool must not do.
 */

/** The 48 contiguous US states plus DC — the jurisdictions a spot truck runs. */
export const JURISDICTIONS: Record<string, string> = {
  AL: "Alabama",
  AR: "Arkansas",
  AZ: "Arizona",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DC: "District of Columbia",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  IA: "Iowa",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  MA: "Massachusetts",
  MD: "Maryland",
  ME: "Maine",
  MI: "Michigan",
  MN: "Minnesota",
  MO: "Missouri",
  MS: "Mississippi",
  MT: "Montana",
  NC: "North Carolina",
  ND: "North Dakota",
  NE: "Nebraska",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NV: "Nevada",
  NY: "New York",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VA: "Virginia",
  VT: "Vermont",
  WA: "Washington",
  WI: "Wisconsin",
  WV: "West Virginia",
  WY: "Wyoming",
};

export const JURISDICTION_CODES = Object.keys(JURISDICTIONS).sort();

/**
 * Land borders. Michigan/Wisconsin and Rhode Island/New York are the two the
 * naive reading gets wrong: Michigan touches Wisconsin only across the lake
 * (not a drivable border), and Rhode Island reaches New York only over water.
 * Both are treated as non-adjacent, which is what a truck experiences.
 */
const BORDERS: Record<string, string[]> = {
  AL: ["FL", "GA", "MS", "TN"],
  AR: ["LA", "MO", "MS", "OK", "TN", "TX"],
  AZ: ["CA", "NM", "NV", "UT"],
  CA: ["AZ", "NV", "OR"],
  CO: ["KS", "NE", "NM", "OK", "UT", "WY"],
  CT: ["MA", "NY", "RI"],
  DC: ["MD", "VA"],
  DE: ["MD", "NJ", "PA"],
  FL: ["AL", "GA"],
  GA: ["AL", "FL", "NC", "SC", "TN"],
  IA: ["IL", "MN", "MO", "NE", "SD", "WI"],
  ID: ["MT", "NV", "OR", "UT", "WA", "WY"],
  IL: ["IA", "IN", "KY", "MO", "WI"],
  IN: ["IL", "KY", "MI", "OH"],
  KS: ["CO", "MO", "NE", "OK"],
  KY: ["IL", "IN", "MO", "OH", "TN", "VA", "WV"],
  LA: ["AR", "MS", "TX"],
  MA: ["CT", "NH", "NY", "RI", "VT"],
  MD: ["DC", "DE", "PA", "VA", "WV"],
  ME: ["NH"],
  MI: ["IN", "OH"],
  MN: ["IA", "ND", "SD", "WI"],
  MO: ["AR", "IA", "IL", "KS", "KY", "NE", "OK", "TN"],
  MS: ["AL", "AR", "LA", "TN"],
  MT: ["ID", "ND", "SD", "WY"],
  NC: ["GA", "SC", "TN", "VA"],
  ND: ["MN", "MT", "SD"],
  NE: ["CO", "IA", "KS", "MO", "SD", "WY"],
  NH: ["MA", "ME", "VT"],
  NJ: ["DE", "NY", "PA"],
  NM: ["AZ", "CO", "OK", "TX", "UT"],
  NV: ["AZ", "CA", "ID", "OR", "UT"],
  NY: ["CT", "MA", "NJ", "PA", "VT"],
  OH: ["IN", "KY", "MI", "PA", "WV"],
  OK: ["AR", "CO", "KS", "MO", "NM", "TX"],
  OR: ["CA", "ID", "NV", "WA"],
  PA: ["DE", "MD", "NJ", "NY", "OH", "WV"],
  RI: ["CT", "MA"],
  SC: ["GA", "NC"],
  SD: ["IA", "MN", "MT", "ND", "NE", "WY"],
  TN: ["AL", "AR", "GA", "KY", "MO", "MS", "NC", "VA"],
  TX: ["AR", "LA", "NM", "OK"],
  UT: ["AZ", "CO", "ID", "NM", "NV", "WY"],
  VA: ["DC", "KY", "MD", "NC", "TN", "WV"],
  VT: ["MA", "NH", "NY"],
  WA: ["ID", "OR"],
  WI: ["IA", "IL", "MN"],
  WV: ["KY", "MD", "OH", "PA", "VA"],
  WY: ["CO", "ID", "MT", "NE", "SD", "UT"],
};

export function isJurisdiction(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(JURISDICTIONS, code.toUpperCase());
}

export function jurisdictionName(code: string): string {
  return JURISDICTIONS[code.toUpperCase()] ?? code.toUpperCase();
}

export function areAdjacent(a: string, b: string): boolean {
  const from = a.toUpperCase();
  const to = b.toUpperCase();
  if (from === to) return true;
  return (BORDERS[from] ?? []).includes(to);
}

/**
 * A drivable route between two jurisdictions, breadth-first — used to name the
 * states missing from a gap ("AR, TN, KY" between TX and OH). Returns the
 * intermediate codes only, or null when no land route exists.
 */
export function statesBetween(from: string, to: string): string[] | null {
  const start = from.toUpperCase();
  const goal = to.toUpperCase();
  if (!BORDERS[start] || !BORDERS[goal]) return null;
  if (start === goal || areAdjacent(start, goal)) return [];

  const queue: string[][] = [[start]];
  const seen = new Set([start]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    for (const nextState of BORDERS[last] ?? []) {
      if (seen.has(nextState)) continue;
      if (nextState === goal) return path.slice(1);
      seen.add(nextState);
      queue.push([...path, nextState]);
    }
  }
  return null;
}
