/**
 * The shape of a seeded toolbox talk. Kept in its own module so the two content
 * files and the seeder can share it without a cycle.
 */
export interface SeedTalk {
  /** Stable slug — the seeder upserts on it, so editing a body updates in place. */
  slug: string;
  title: string;
  /** Lower-case hazard tags; the library filters on these. */
  hazardTags: string[];
  /** Markdown, in the subset `lib/markdown.ts` renders. */
  body: string;
  /** Read-aloud time. Every seeded talk is a five-minute talk by design. */
  estMinutes?: number;
}
