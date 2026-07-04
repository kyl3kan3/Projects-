/**
 * src/lib/crypto.ts
 *
 * Field-level PHI encryption: AES-256-GCM with per-practice data keys,
 * envelope-encrypted under FIELD_ENCRYPTION_MASTER_KEY. Every decrypt
 * path is audit-hooked -- there is no unaudited read of PHI in app code.
 *
 * TODO:
 * - [ ] generatePracticeDek(): random 32-byte DEK, wrapped with the
 *       master key, stored on practices.dek_wrapped.
 * - [ ] encryptField(practiceId, plaintext): AES-256-GCM with random IV,
 *       output iv || ciphertext || tag as bytea.
 * - [ ] decryptField(practiceId, ciphertext, auditCtx): decrypt AND
 *       append the `viewed` audit event via lib/audit -- the audit hook
 *       is mandatory, enforced by requiring auditCtx.
 * - [ ] hashIntakeToken(rawToken): HMAC-SHA-256 with INTAKE_TOKEN_SECRET
 *       (raw tokens live only in links, never at rest).
 * - [ ] Key rotation: rewrapDek(practiceId, newMasterKey) runbook helper.
 * - [ ] Never log plaintext, keys, or IVs; scrub errors.
 */

export interface AuditContext {
  actorType: "user" | "patient" | "system";
  actorId: string;
  ip?: string;
}

export function encryptField(_practiceId: string, _plaintext: string): Uint8Array {
  throw new Error("Not implemented");
}

export function decryptField(
  _practiceId: string,
  _ciphertext: Uint8Array,
  _auditCtx: AuditContext,
): string {
  throw new Error("Not implemented");
}
