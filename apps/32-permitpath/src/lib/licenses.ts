/**
 * The licence and credential vault.
 *
 * The only interesting behaviour is what happens on renewal: the expiry ladder is
 * re-planned against the new date and the rungs already sent are cleared, because
 * next cycle's T-30 is a different notice from last cycle's. Nothing here stores a
 * derived "expired" flag — see lib/credentials.credentialStatus.
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  licensesAndCredentials,
  type Credential,
  type CredentialKind,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { cancelAlertsForSubject, planAlertsForSubject } from "@/lib/expiry";
import { appError } from "@/lib/errors";

export async function listCredentials(organizationId: string): Promise<Credential[]> {
  const db = getDb();
  return db
    .select()
    .from(licensesAndCredentials)
    .where(eq(licensesAndCredentials.organizationId, organizationId))
    .orderBy(asc(licensesAndCredentials.expiresAt));
}

export async function getCredential(
  id: string,
  organizationId: string,
): Promise<Credential | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(licensesAndCredentials)
    .where(
      and(
        eq(licensesAndCredentials.id, id),
        eq(licensesAndCredentials.organizationId, organizationId),
      ),
    );
  return row ?? null;
}

export interface CredentialInput {
  organizationId: string;
  actorUserId: string;
  kind: CredentialKind;
  issuingAuthority: string;
  number: string;
  holder: string;
  expiresAt: Date;
  renewalUrl?: string | null;
  assignedUserId?: string | null;
  notes?: string | null;
}

export async function createCredential(input: CredentialInput): Promise<Credential> {
  if (!input.number.trim()) throw appError("Enter the licence or policy number");
  if (!input.issuingAuthority.trim()) throw appError("Enter the issuing authority");
  if (!input.holder.trim()) throw appError("Enter who holds it");

  const db = getDb();
  const [created] = await db
    .insert(licensesAndCredentials)
    .values({
      organizationId: input.organizationId,
      kind: input.kind,
      issuingAuthority: input.issuingAuthority.trim(),
      number: input.number.trim(),
      holder: input.holder.trim(),
      expiresAt: input.expiresAt,
      renewalUrl: input.renewalUrl?.trim() || null,
      assignedUserId: input.assignedUserId ?? null,
      notes: input.notes?.trim() || null,
    })
    .returning();

  await planAlertsForSubject("license", created.id, {
    organizationId: created.organizationId,
    assignedUserId: created.assignedUserId,
    expiresAt: created.expiresAt,
  });

  await recordAudit({
    action: "credential.added",
    target: `credential:${created.id}`,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    metadata: { kind: created.kind, expiresAt: created.expiresAt.toISOString() },
  });

  return created;
}

/** Record a renewal: new expiry, and the whole ladder re-planned against it. */
export async function renewCredential(input: {
  credentialId: string;
  organizationId: string;
  actorUserId: string;
  newExpiresAt: Date;
}): Promise<Credential> {
  const db = getDb();
  const existing = await getCredential(input.credentialId, input.organizationId);
  if (!existing) throw appError("That credential could not be found");
  if (input.newExpiresAt <= existing.expiresAt) {
    throw appError("A renewal has to move the expiry date forward");
  }

  const [updated] = await db
    .update(licensesAndCredentials)
    .set({ expiresAt: input.newExpiresAt, updatedAt: sql`now()` })
    .where(eq(licensesAndCredentials.id, existing.id))
    .returning();

  await planAlertsForSubject("license", updated.id, {
    organizationId: updated.organizationId,
    assignedUserId: updated.assignedUserId,
    expiresAt: updated.expiresAt,
  });

  await recordAudit({
    action: "credential.renewed",
    target: `credential:${updated.id}`,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    metadata: {
      from: existing.expiresAt.toISOString(),
      to: updated.expiresAt.toISOString(),
    },
  });

  return updated;
}

export async function deleteCredential(input: {
  credentialId: string;
  organizationId: string;
}): Promise<void> {
  const db = getDb();
  const existing = await getCredential(input.credentialId, input.organizationId);
  if (!existing) return;
  await cancelAlertsForSubject("license", existing.id);
  await db.delete(licensesAndCredentials).where(eq(licensesAndCredentials.id, existing.id));
}
