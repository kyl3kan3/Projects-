/**
 * The seeded toolbox-talk library: 55 talks, hazard-tagged, in rotation order.
 *
 * Rotation order is the order the talks were written in, which is deliberately
 * not random: the fall-protection and ladder talks come first because that is
 * what kills people, and the seasonal ones (heat, cold, sun, weather) are spread
 * so a company starting in June does not get four heat talks in a row.
 *
 * Pure data. Safe to import anywhere, including a client component.
 */

import { TALKS_A } from "./talks-a";
import { TALKS_B } from "./talks-b";
import type { SeedTalk } from "./talk-types";

export type { SeedTalk } from "./talk-types";

export const SEED_TALKS: SeedTalk[] = [...TALKS_A, ...TALKS_B];

/** Every hazard tag in the library, sorted, for the filter chips. */
export const HAZARD_TAGS: string[] = Array.from(
  new Set(SEED_TALKS.flatMap((t) => t.hazardTags)),
).sort();

export function seedTalkBySlug(slug: string): SeedTalk | undefined {
  return SEED_TALKS.find((t) => t.slug === slug);
}
