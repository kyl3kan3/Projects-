/**
 * src/lib/signing.ts
 *
 * The sign & lock gate — the product's load-bearing invariant, in one file.
 *
 * Two claims the README makes to clinicians, and what enforces each:
 *
 *  1. **"A note is not a note until a human signs it."** `signNote` is the only
 *     code in the repository that writes `notes.status = 'signed'`, and it does
 *     so in the same transaction as the `signatures` row. There is no auto-sign
 *     path, no "sign on behalf of", and no scheduled job that could ever produce
 *     one. `src/lib/signing.test.ts` proves it by scanning the source tree.
 *  2. **"Signed versions are immutable."** Every edit path calls
 *     `assertUnsigned`, and the database backs it up: migration 0001 puts
 *     append-only triggers on `note_versions` and `signatures`, so a signed
 *     snapshot cannot be rewritten even by a mistake in this file. Amendments
 *     open version N+1 and must be signed in their own right.
 *
 * The hash is an HMAC-SHA256 over a canonical rendering of the version's
 * content, keyed with `NOTE_HASH_SECRET`. Canonicalisation is the part worth
 * being careful about: sections are emitted in template order with keys sorted
 * and text whitespace-normalised, so the same content always produces the same
 * hash, and a hash computed at export time can be compared against the one
 * stamped at signing time.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  notes,
  noteVersions,
  sessions,
  signatures,
  users,
  type Note,
  type NoteSection,
  type NoteVersion,
  type Signature,
} from "@/db/schema";
import { env } from "@/lib/env";
import { recordAudit } from "@/lib/audit";

export class SignedNoteError extends Error {}
export class EmptyNoteError extends Error {}

/* ------------------------------------------------------- canonical content */

/**
 * A stable string for a version's content.
 *
 * Includes the note id and version so a hash cannot be replayed onto a
 * different note or a different version of the same note.
 */
export function canonicalizeContent(
  noteId: string,
  version: number,
  sections: NoteSection[],
): string {
  const canonical = sections.map((s) => ({
    key: s.key,
    text: s.text.replace(/\s+/g, " ").trim(),
  }));
  return JSON.stringify({ noteId, version, sections: canonical });
}

export function contentHash(
  noteId: string,
  version: number,
  sections: NoteSection[],
): string {
  return createHmac("sha256", env.noteHashSecret)
    .update(canonicalizeContent(noteId, version, sections))
    .digest("hex");
}

/** Constant-time comparison — a hash check is a security check. */
export function hashMatches(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/* ------------------------------------------------------------------ guards */

/** The guard every edit path calls first. */
export function assertUnsigned(note: Pick<Note, "status">): void {
  if (note.status === "signed") {
    throw new SignedNoteError(
      "This note is signed and locked. Create an amendment to change it — the signed version stays exactly as it was.",
    );
  }
}

export function hasContent(sections: NoteSection[]): boolean {
  return sections.some((s) => s.text.trim().length > 0);
}

/* -------------------------------------------------------------------- sign */

export interface SignResult {
  noteId: string
  version: number;
  contentHash: string;
  signedAt: Date;
  signerName: string;
  signerCredentials: string;
}

export interface SignOptions {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Sign the working copy.
 *
 * One transaction: snapshot the content as a new immutable version, write the
 * signature over that exact version, flip the note and its session to signed.
 * Anything less and a crash could leave a note marked signed with no signature
 * behind it — which is the one state this product must never be able to reach.
 */
export async function signNote(
  noteId: string,
  signerId: string,
  options: SignOptions = {},
): Promise<SignResult> {
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const [note] = await tx.select().from(notes).where(eq(notes.id, noteId)).for("update");
    if (!note) throw new SignedNoteError("That note no longer exists");
    assertUnsigned(note);
    if (!hasContent(note.sections)) {
      throw new EmptyNoteError(
        "There is nothing to sign yet — the draft has no content.",
      );
    }

    const [signer] = await tx.select().from(users).where(eq(users.id, signerId));
    if (!signer) throw new SignedNoteError("Signer not found");
    if (signer.practiceId !== (await practiceIdForNote(tx, note))) {
      throw new SignedNoteError("You cannot sign another practice's note");
    }

    // An existing signature means this is an amendment being signed.
    const [prior] = await tx
      .select()
      .from(signatures)
      .where(eq(signatures.noteId, noteId))
      .orderBy(desc(signatures.version))
      .limit(1);

    const version = note.currentVersion + 1;
    const hash = contentHash(noteId, version, note.sections);

    await tx.insert(noteVersions).values({
      noteId,
      version,
      sections: note.sections,
      reason: prior ? "amendment" : "edit",
      createdBy: signerId,
    });

    const [signature] = await tx
      .insert(signatures)
      .values({
        noteId,
        version,
        signerId,
        signerCredentials: signer.credentials || signer.name,
        kind: "author",
        contentHash: hash,
      })
      .returning();

    await tx
      .update(notes)
      .set({ status: "signed", currentVersion: version, updatedAt: new Date() })
      .where(eq(notes.id, noteId));

    await tx
      .update(sessions)
      .set({ status: "signed", updatedAt: new Date() })
      .where(eq(sessions.id, note.sessionId));

    return {
      practiceId: signer.practiceId,
      result: {
        noteId,
        version,
        contentHash: hash,
        signedAt: signature.signedAt,
        signerName: signer.name,
        signerCredentials: signer.credentials || signer.name,
      } satisfies SignResult,
    };
  });

  await recordAudit({
    practiceId: result.practiceId,
    actorId: signerId,
    action: "signed",
    targetKind: "note",
    targetId: noteId,
    ip: options.ip,
    userAgent: options.userAgent,
    metadata: {
      version: result.result.version,
      contentHash: result.result.contentHash,
    },
  });

  return result.result;
}

/**
 * Open an amendment.
 *
 * The signed version is left exactly as it was; the working copy becomes
 * editable again and the note enters `amended`, which is *not* a signed state —
 * it must be signed again, producing version N+1 with its own signature. The
 * export renders the whole chain, so a reader sees what changed and when.
 */
export async function amendNote(
  noteId: string,
  userId: string,
  options: SignOptions = {},
): Promise<{ noteId: string; fromVersion: number }> {
  const db = getDb();
  const out = await db.transaction(async (tx) => {
    const [note] = await tx.select().from(notes).where(eq(notes.id, noteId)).for("update");
    if (!note) throw new SignedNoteError("That note no longer exists");
    if (note.status !== "signed") {
      throw new SignedNoteError(
        "Only a signed note can be amended — this one is still a draft you can edit directly.",
      );
    }
    await tx
      .update(notes)
      .set({ status: "amended", updatedAt: new Date() })
      .where(eq(notes.id, noteId));
    await tx
      .update(sessions)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(sessions.id, note.sessionId));
    return { practiceId: await practiceIdForNote(tx, note), fromVersion: note.currentVersion };
  });

  await recordAudit({
    practiceId: out.practiceId,
    actorId: userId,
    action: "amended",
    targetKind: "note",
    targetId: noteId,
    ip: options.ip,
    userAgent: options.userAgent,
    metadata: { version: out.fromVersion },
  });

  return { noteId, fromVersion: out.fromVersion };
}

/* ------------------------------------------------------------------ chains */

export interface SignedVersion {
  version: NoteVersion;
  signature: Signature | null;
  /** Does the stored hash still match the stored content? */
  intact: boolean;
}

/** The version chain, oldest first — what the PDF and the trust screen render. */
export async function versionChain(noteId: string): Promise<SignedVersion[]> {
  const db = getDb();
  const versions = await db
    .select()
    .from(noteVersions)
    .where(eq(noteVersions.noteId, noteId))
    .orderBy(noteVersions.version);
  const sigs = await db
    .select()
    .from(signatures)
    .where(and(eq(signatures.noteId, noteId), eq(signatures.kind, "author")));

  return versions.map((version) => {
    const signature = sigs.find((s) => s.version === version.version) ?? null;
    const intact = signature
      ? hashMatches(
          signature.contentHash,
          contentHash(noteId, version.version, version.sections),
        )
      : true;
    return { version, signature, intact };
  });
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** The practice a note belongs to, resolved through its session's client. */
async function practiceIdForNote(tx: Tx, note: Note): Promise<string> {
  const [row] = await tx
    .select({ practiceId: clients.practiceId })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(eq(sessions.id, note.sessionId));
  if (!row?.practiceId) throw new SignedNoteError("Note is not attached to a practice");
  return row.practiceId;
}
