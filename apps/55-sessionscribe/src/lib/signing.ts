/**
 * src/lib/signing.ts
 *
 * The sign & lock gate — the product's load-bearing invariant. A note is not
 * a note until a human signs it, and a signed version is immutable.
 *
 * TODO:
 * - [ ] canonicalizeContent(): stable JSON serialization of a version's
 *       sections (sorted keys, trimmed text) so hashes are reproducible.
 * - [ ] contentHash(): HMAC-SHA256 over the canonical content with
 *       NOTE_HASH_SECRET; hex, lowercase.
 * - [ ] signNote(): in ONE transaction — snapshot current sections to
 *       note_versions, write the signatures row (author), flip note status
 *       to signed and session status to signed, write the audit event.
 * - [ ] cosignNote(): supervisor signature over the SAME version + hash;
 *       rejects if content hash no longer matches (amendment happened).
 * - [ ] amendNote(): opens version N+1 (reason: amendment) copying the
 *       signed content as the starting point; the new version must itself
 *       be signed. Never mutates version N.
 * - [ ] assertUnsigned(): guard used by every edit path — editing a signed
 *       version throws. Covered by tests before UI exists.
 */

export type SignResult = {
  noteId: string;
  version: number;
  contentHash: string;
  signedAt: Date;
};

export async function signNote(
  _noteId: string,
  _signerId: string,
): Promise<SignResult> {
  // TODO: implement per ARCHITECTURE.md key flow 2
  throw new Error("Not implemented");
}

export async function amendNote(
  _noteId: string,
  _userId: string,
): Promise<{ noteId: string; newVersion: number }> {
  throw new Error("Not implemented");
}
