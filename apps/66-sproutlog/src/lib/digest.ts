/**
 * src/lib/digest.ts
 *
 * The daily digest: the day's events per family rendered as plain,
 * warm sentences ("Slept 12:40–2:10. Ate all of lunch. Two diaper
 * changes.") with photos. Stored in the ledger before sending — what
 * the parent saw is reproducible.
 *
 * TODO:
 * - [ ] compileFamilyDigest(familyId, date): sentences per child from
 *       the event stream (meal components summarized humanly, nap
 *       pairs joined, diapers counted); photo keys.
 * - [ ] renderDigestEmail: the ribbon header + sentences + photos
 *       (signed GET URLs, short expiry).
 * - [ ] sendDay(providerId, date): per-family, ledger-unique,
 *       digest_opt_out respected, absent days skipped, DRY_RUN
 *       honored.
 */

export interface CompiledDigest {
  familyId: string;
  forDate: string;
  sentences: Array<{ childName: string; lines: string[] }>;
  photoKeys: string[];
}

export async function compileFamilyDigest(familyId: string, date: string): Promise<CompiledDigest> {
  throw new Error("Not implemented");
}

export async function sendDay(providerId: string, date: string): Promise<{ sent: number }> {
  throw new Error("Not implemented");
}
