/**
 * src/lib/digest.ts
 *
 * The weekly family digest: per enrolled family — this week's schedule
 * with room moves highlighted, teacher notes entered that week,
 * upcoming dates. Always sends; the empty week sends the one quiet
 * line. Send ledger in `digests`.
 *
 * TODO:
 * - [ ] compileDigest(familyId, weekOf): sections or the quiet line.
 * - [ ] renderDigestEmail per DESIGN.md type roles (serif headings).
 * - [ ] sendWeek(coopId, weekOf): per-family sends, ledger rows,
 *       DRY_RUN honored.
 */

export interface FamilyDigest {
  familyId: string;
  weekOf: string;
  quiet: boolean;
  sections: Array<{ title: string; items: string[] }>;
}

export async function compileDigest(familyId: string, weekOf: string): Promise<FamilyDigest> {
  throw new Error("Not implemented");
}

export async function sendWeek(coopId: string, weekOf: string): Promise<{ sent: number }> {
  throw new Error("Not implemented");
}
