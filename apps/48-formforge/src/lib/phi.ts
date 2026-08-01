/**
 * src/lib/phi.ts
 *
 * The only way to read PHI.
 *
 * `lib/crypto.ts` can encrypt and it exposes `open()` for raw bytes, but every
 * *product* read of a patient's data goes through `readPhi` here, which appends
 * the `viewed` audit event around the decryption. The audit hook is not a
 * convention a route can forget: the plaintext is only reachable inside the
 * callback `readPhi` invokes, and `phi.test.ts` fails the build if any file
 * outside this module reaches for `open()` on a PHI column.
 *
 * The event is written in a `finally`, so an attempted read that then throws is
 * still on the record. That is the behaviour an auditor wants: "who tried" is as
 * interesting as "who succeeded".
 */

import { encryptBytes, encryptField, open, unwrapDek } from "@/lib/crypto";
import { appendAuditEvent, type AuditMetadata } from "@/lib/audit";
import { env } from "@/lib/env";
import type { ActorType, Practice } from "@/db/schema";

/** Who is reading, for the audit row. */
export interface PhiActor {
  type: ActorType;
  id: string | null;
  /** "Dana Reyes (front desk)", "patient", "retention sweep". */
  label: string;
  ip?: string | null;
}

/** What is being read, for the audit row. Labels must be PHI-free. */
export interface PhiTarget {
  targetType: "intake" | "patient" | "signature" | "upload" | "submission";
  targetId: string | null;
  targetLabel?: string;
  metadata?: AuditMetadata;
}

/**
 * Unwrap a practice's data key.
 *
 * Cached per process by practice id *and* by a fingerprint of the wrapped bytes,
 * so a re-wrapped key (rotation) invalidates the entry instead of serving a
 * stale one. The plaintext key never leaves this module's closure.
 */
const dekCache = new Map<string, { fingerprint: string; dek: Buffer }>();

export function practiceDek(practice: Pick<Practice, "id" | "dekWrapped">): Buffer {
  const fingerprint = practice.dekWrapped.toString("base64");
  const hit = dekCache.get(practice.id);
  if (hit && hit.fingerprint === fingerprint) return hit.dek;
  const dek = unwrapDek(practice.dekWrapped, env.masterKey);
  dekCache.set(practice.id, { fingerprint, dek });
  return dek;
}

/** Clear the cache — used by tests and by the rotation runbook. */
export function forgetPracticeDek(practiceId?: string): void {
  if (practiceId) dekCache.delete(practiceId);
  else dekCache.clear();
}

/**
 * Encrypt a value for a practice.
 *
 * Writing is not a disclosure, so it needs no audit event — but it does need to
 * not hand the raw key to a caller. Every module that stores PHI uses these two
 * functions and never touches `practiceDek`, which is what keeps the allowlist in
 * `phi.test.ts` down to the handful of files that genuinely read plaintext.
 */
export function sealFor(practice: Pick<Practice, "id" | "dekWrapped">, plaintext: string): Buffer {
  return encryptField(practiceDek(practice), plaintext);
}

export function sealBytesFor(practice: Pick<Practice, "id" | "dekWrapped">, bytes: Buffer): Buffer {
  return encryptBytes(practiceDek(practice), bytes);
}

/** Decrypts a nullable ciphertext column to a string. */
export type Unseal = (ciphertext: Buffer | null | undefined) => string | null;

/**
 * Read PHI with the audit event attached.
 *
 * ```ts
 * const name = await readPhi(practice, actor, target, (unseal) => ({
 *   first: unseal(patient.firstNameEnc),
 *   last: unseal(patient.lastNameEnc),
 * }));
 * ```
 */
export async function readPhi<T>(
  practice: Pick<Practice, "id" | "dekWrapped">,
  actor: PhiActor,
  target: PhiTarget,
  read: (unseal: Unseal) => T,
): Promise<T> {
  const dek = practiceDek(practice);
  let fields = 0;
  const unseal: Unseal = (ciphertext) => {
    if (!ciphertext) return null;
    fields += 1;
    return open(ciphertext, dek).toString("utf8");
  };

  try {
    return read(unseal);
  } finally {
    await appendAuditEvent({
      practiceId: practice.id,
      actorType: actor.type,
      actorId: actor.id,
      actorLabel: actor.label,
      action: "viewed",
      targetType: target.targetType,
      targetId: target.targetId,
      targetLabel: target.targetLabel ?? "",
      ip: actor.ip ?? null,
      metadata: { fields, ...(target.metadata ?? {}) },
    });
  }
}

/**
 * Decrypt raw bytes (an uploaded file) with the audit event attached. Separate
 * from `readPhi` only because the payload is bytes, not text.
 */
export async function readPhiBytes(
  practice: Pick<Practice, "id" | "dekWrapped">,
  actor: PhiActor,
  target: PhiTarget,
  ciphertext: Buffer,
): Promise<Buffer> {
  const dek = practiceDek(practice);
  try {
    return open(ciphertext, dek);
  } finally {
    await appendAuditEvent({
      practiceId: practice.id,
      actorType: actor.type,
      actorId: actor.id,
      actorLabel: actor.label,
      action: "viewed",
      targetType: target.targetType,
      targetId: target.targetId,
      targetLabel: target.targetLabel ?? "",
      ip: actor.ip ?? null,
      metadata: { bytes: ciphertext.length, ...(target.metadata ?? {}) },
    });
  }
}

/**
 * The patient's own read of their own packet, mid-flow.
 *
 * Still audited — actor `patient`, actor id the intake — but it exists as a
 * separate function so the ledger can tell "the patient re-opened their link"
 * apart from a member of staff opening the packet. Both are reads; only
 * one of them is a disclosure.
 */
export async function readOwnPhi<T>(
  practice: Pick<Practice, "id" | "dekWrapped">,
  intakeId: string,
  ip: string | null,
  read: (unseal: Unseal) => T,
): Promise<T> {
  return readPhi(
    practice,
    { type: "patient", id: intakeId, label: "patient (own packet)", ip },
    { targetType: "intake", targetId: intakeId, targetLabel: "packet" },
    read,
  );
}
