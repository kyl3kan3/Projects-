/**
 * Curriculum templates — the answer to the onboarding cliff in README's risk 1.
 * An owner picks their style and the rank ladder exists, with requirements a
 * real school would recognise, before they have typed anything.
 *
 * Requirements are per-rank totals: `minClasses` and `minDaysInRank` cover the
 * whole rank, and `stripes` splits them into steps (see src/lib/progression.ts).
 *
 * ## About the purple belt
 *
 * DESIGN_LANGUAGE.md rule 11 bans hues ~250-310° from the *interface*. A BJJ
 * purple belt and a 5th-kyu purple belt are hues ~280°, and they are not
 * interface: DESIGN.md's colour law says belt colours "are data ... content, not
 * UI accent, and they never leak into chrome". They are stored per rank, editable
 * by the school, and rendered only inside the belt band — never as a token, a
 * background, a button, a link or an accent, and never on the marketing page.
 * Deleting the purple belt from a jiu-jitsu ladder would be the actual design
 * failure.
 */

/**
 * The authentic dyed-cotton belt colours, in one place.
 *
 * These are *data*: they seed a curriculum, they are editable per school, and
 * they are only ever painted inside the belt band. Naming them here keeps every
 * other file free of colour literals — see tools/craft-check.mjs.
 */
export const BELT_PRESETS = {
  white: "#F2EFE6",
  grey: "#8C8A85",
  yellow: "#D9B233",
  orange: "#C4622D",
  green: "#3F6B3A",
  blue: "#2B4C7E",
  purple: "#4B2E5A",
  brown: "#5A3A22",
  red: "#A33127",
  black: "#1C1A18",
} as const;

export type BeltPreset = keyof typeof BELT_PRESETS;

export interface RankTemplate {
  name: string;
  beltColorHex: string;
  stripes: number;
  minClasses: number;
  minDaysInRank: number;
  requiresSignoff: boolean;
}

export interface CurriculumTemplate {
  key: string;
  program: string;
  description: string;
  ranks: RankTemplate[];
}

export const CURRICULUM_TEMPLATES: CurriculumTemplate[] = [
  {
    key: "bjj-adult",
    program: "BJJ Adults",
    description: "IBJJF-shaped adult ladder: four stripes per belt, time-in-rank minimums.",
    ranks: [
      { name: "White belt", beltColorHex: BELT_PRESETS.white, stripes: 4, minClasses: 60, minDaysInRank: 180, requiresSignoff: false },
      { name: "Blue belt", beltColorHex: BELT_PRESETS.blue, stripes: 4, minClasses: 100, minDaysInRank: 730, requiresSignoff: true },
      { name: "Purple belt", beltColorHex: BELT_PRESETS.purple, stripes: 4, minClasses: 120, minDaysInRank: 540, requiresSignoff: true },
      { name: "Brown belt", beltColorHex: BELT_PRESETS.brown, stripes: 4, minClasses: 120, minDaysInRank: 365, requiresSignoff: true },
      { name: "Black belt", beltColorHex: BELT_PRESETS.black, stripes: 6, minClasses: 200, minDaysInRank: 1095, requiresSignoff: true },
    ],
  },
  {
    key: "bjj-kids",
    program: "Little Tigers (BJJ Kids)",
    description: "Kids' grey-to-green ladder, shorter steps so progress stays visible.",
    ranks: [
      { name: "White belt", beltColorHex: BELT_PRESETS.white, stripes: 4, minClasses: 24, minDaysInRank: 90, requiresSignoff: false },
      { name: "Grey belt", beltColorHex: BELT_PRESETS.grey, stripes: 4, minClasses: 32, minDaysInRank: 120, requiresSignoff: false },
      { name: "Yellow belt", beltColorHex: BELT_PRESETS.yellow, stripes: 4, minClasses: 40, minDaysInRank: 180, requiresSignoff: false },
      { name: "Orange belt", beltColorHex: BELT_PRESETS.orange, stripes: 4, minClasses: 48, minDaysInRank: 210, requiresSignoff: true },
      { name: "Green belt", beltColorHex: BELT_PRESETS.green, stripes: 4, minClasses: 56, minDaysInRank: 240, requiresSignoff: true },
    ],
  },
  {
    key: "karate-10kyu",
    program: "Karate",
    description: "Ten-kyu Shotokan ladder; kyu gradings are examined, so sign-off is on.",
    ranks: [
      { name: "10th kyu — White", beltColorHex: BELT_PRESETS.white, stripes: 2, minClasses: 20, minDaysInRank: 60, requiresSignoff: false },
      { name: "9th kyu — Yellow", beltColorHex: BELT_PRESETS.yellow, stripes: 2, minClasses: 24, minDaysInRank: 90, requiresSignoff: true },
      { name: "8th kyu — Orange", beltColorHex: BELT_PRESETS.orange, stripes: 2, minClasses: 28, minDaysInRank: 90, requiresSignoff: true },
      { name: "7th kyu — Green", beltColorHex: BELT_PRESETS.green, stripes: 2, minClasses: 32, minDaysInRank: 120, requiresSignoff: true },
      { name: "6th kyu — Blue", beltColorHex: BELT_PRESETS.blue, stripes: 2, minClasses: 36, minDaysInRank: 150, requiresSignoff: true },
      { name: "5th kyu — Purple", beltColorHex: BELT_PRESETS.purple, stripes: 2, minClasses: 40, minDaysInRank: 180, requiresSignoff: true },
      { name: "4th kyu — Brown", beltColorHex: BELT_PRESETS.brown, stripes: 3, minClasses: 48, minDaysInRank: 210, requiresSignoff: true },
      { name: "3rd kyu — Brown", beltColorHex: BELT_PRESETS.brown, stripes: 3, minClasses: 48, minDaysInRank: 210, requiresSignoff: true },
      { name: "2nd kyu — Brown", beltColorHex: BELT_PRESETS.brown, stripes: 3, minClasses: 52, minDaysInRank: 240, requiresSignoff: true },
      { name: "1st kyu — Brown", beltColorHex: BELT_PRESETS.brown, stripes: 3, minClasses: 56, minDaysInRank: 270, requiresSignoff: true },
      { name: "1st dan — Black", beltColorHex: BELT_PRESETS.black, stripes: 0, minClasses: 80, minDaysInRank: 365, requiresSignoff: true },
    ],
  },
  {
    key: "tkd",
    program: "Taekwondo",
    description: "Nine-gup TKD ladder with the half-step tag belts folded into stripes.",
    ranks: [
      { name: "White belt", beltColorHex: BELT_PRESETS.white, stripes: 1, minClasses: 16, minDaysInRank: 45, requiresSignoff: false },
      { name: "Yellow belt", beltColorHex: BELT_PRESETS.yellow, stripes: 1, minClasses: 20, minDaysInRank: 60, requiresSignoff: false },
      { name: "Green belt", beltColorHex: BELT_PRESETS.green, stripes: 1, minClasses: 24, minDaysInRank: 90, requiresSignoff: true },
      { name: "Blue belt", beltColorHex: BELT_PRESETS.blue, stripes: 1, minClasses: 28, minDaysInRank: 120, requiresSignoff: true },
      { name: "Red belt", beltColorHex: BELT_PRESETS.red, stripes: 2, minClasses: 36, minDaysInRank: 180, requiresSignoff: true },
      { name: "Black belt", beltColorHex: BELT_PRESETS.black, stripes: 0, minClasses: 60, minDaysInRank: 365, requiresSignoff: true },
    ],
  },
  {
    key: "judo",
    program: "Judo",
    description: "Kodokan kyu ladder for a club running one adult class.",
    ranks: [
      { name: "6th kyu — White", beltColorHex: BELT_PRESETS.white, stripes: 0, minClasses: 20, minDaysInRank: 60, requiresSignoff: false },
      { name: "5th kyu — Yellow", beltColorHex: BELT_PRESETS.yellow, stripes: 0, minClasses: 30, minDaysInRank: 120, requiresSignoff: true },
      { name: "4th kyu — Orange", beltColorHex: BELT_PRESETS.orange, stripes: 0, minClasses: 40, minDaysInRank: 180, requiresSignoff: true },
      { name: "3rd kyu — Green", beltColorHex: BELT_PRESETS.green, stripes: 0, minClasses: 50, minDaysInRank: 240, requiresSignoff: true },
      { name: "2nd kyu — Blue", beltColorHex: BELT_PRESETS.blue, stripes: 0, minClasses: 60, minDaysInRank: 300, requiresSignoff: true },
      { name: "1st kyu — Brown", beltColorHex: BELT_PRESETS.brown, stripes: 0, minClasses: 70, minDaysInRank: 365, requiresSignoff: true },
      { name: "1st dan — Black", beltColorHex: BELT_PRESETS.black, stripes: 0, minClasses: 90, minDaysInRank: 540, requiresSignoff: true },
    ],
  },
];

export function templateByKey(key: string): CurriculumTemplate | undefined {
  return CURRICULUM_TEMPLATES.find((t) => t.key === key);
}
