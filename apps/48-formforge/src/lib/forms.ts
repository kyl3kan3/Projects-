/**
 * src/lib/forms.ts
 *
 * Forms and their published versions.
 *
 * Publishing is the only interesting operation here, and its contract is the one
 * the whole product's defensibility rests on: **a publish writes a new immutable
 * `form_versions` row and never touches an old one.** Editing a live form after
 * a patient signed produces version 3; the signature keeps pointing at version 2,
 * and version 2 still says exactly what it said. The database enforces it too —
 * migration 0001 refuses UPDATE and DELETE on `form_versions`.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  formVersions,
  forms,
  intakes,
  type Form,
  type FormBlock,
  type FormVersion,
} from "@/db/schema";
import { renderVersionText, validateForm } from "@/lib/blocks";
import { sha256Hex } from "@/lib/crypto";
import { appendAuditEvent } from "@/lib/audit";
import { templateByKey } from "@/lib/templates";
import type { PhiActor } from "@/lib/phi";

export class FormError extends Error {}

export async function listForms(practiceId: string): Promise<Form[]> {
  const db = getDb();
  return db
    .select()
    .from(forms)
    .where(eq(forms.practiceId, practiceId))
    .orderBy(desc(forms.updatedAt));
}

export async function getForm(practiceId: string, formId: string): Promise<Form | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(forms)
    .where(and(eq(forms.id, formId), eq(forms.practiceId, practiceId)));
  return row ?? null;
}

/** Copy a gallery template into the practice as an editable draft. */
export async function createFormFromTemplate(
  practiceId: string,
  templateKey: string,
  actor: PhiActor,
): Promise<Form> {
  const template = templateByKey(templateKey);
  if (!template) throw new FormError("That template does not exist");
  return createForm(
    practiceId,
    { title: template.title, description: template.description, blocks: template.blocks, templateKey },
    actor,
  );
}

export async function createForm(
  practiceId: string,
  input: { title: string; description?: string; blocks: FormBlock[]; templateKey?: string },
  actor: PhiActor,
): Promise<Form> {
  if (!input.title.trim()) throw new FormError("Give the packet a title");
  const db = getDb();
  const [row] = await db
    .insert(forms)
    .values({
      practiceId,
      title: input.title.trim(),
      description: input.description ?? "",
      blocks: input.blocks,
      templateKey: input.templateKey ?? null,
      status: "draft",
    })
    .returning();
  await appendAuditEvent({
    practiceId,
    actorType: actor.type,
    actorId: actor.id,
    actorLabel: actor.label,
    action: "edited",
    targetType: "form",
    targetId: row.id,
    targetLabel: row.title,
    ip: actor.ip ?? null,
    metadata: { result: "created", blocks: input.blocks.length },
  });
  return row;
}

/** Save the draft. Published versions are untouched, by construction. */
export async function saveDraft(
  practiceId: string,
  formId: string,
  input: { title?: string; description?: string; blocks?: FormBlock[] },
  actor: PhiActor,
): Promise<Form> {
  const db = getDb();
  const existing = await getForm(practiceId, formId);
  if (!existing) throw new FormError("That packet is not in this practice");
  const [row] = await db
    .update(forms)
    .set({
      title: input.title?.trim() || existing.title,
      description: input.description ?? existing.description,
      blocks: input.blocks ?? existing.blocks,
      updatedAt: new Date(),
    })
    .where(and(eq(forms.id, formId), eq(forms.practiceId, practiceId)))
    .returning();
  await appendAuditEvent({
    practiceId,
    actorType: actor.type,
    actorId: actor.id,
    actorLabel: actor.label,
    action: "edited",
    targetType: "form",
    targetId: row.id,
    targetLabel: row.title,
    ip: actor.ip ?? null,
    metadata: { blocks: (input.blocks ?? existing.blocks).length },
  });
  return row;
}

export async function archiveForm(
  practiceId: string,
  formId: string,
  actor: PhiActor,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .update(forms)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(forms.id, formId), eq(forms.practiceId, practiceId)))
    .returning();
  if (!row) throw new FormError("That packet is not in this practice");
  await appendAuditEvent({
    practiceId,
    actorType: actor.type,
    actorId: actor.id,
    actorLabel: actor.label,
    action: "edited",
    targetType: "form",
    targetId: formId,
    targetLabel: row.title,
    ip: actor.ip ?? null,
    metadata: { status: "archived" },
  });
}

/**
 * Publish: validate, snapshot, stamp.
 *
 * The version number is allocated from the form row inside a transaction, so two
 * simultaneous publishes cannot both claim v4 — and if they somehow did, the
 * unique index on (form_id, version) would refuse the second.
 */
export async function publishForm(
  practiceId: string,
  formId: string,
  actor: PhiActor,
): Promise<FormVersion> {
  const form = await getForm(practiceId, formId);
  if (!form) throw new FormError("That packet is not in this practice");

  const problems = validateForm(form.blocks);
  if (problems.length) throw new FormError(problems.join(" "));

  const db = getDb();
  const version = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.practiceId, practiceId)))
      .for("update");
    if (!locked) throw new FormError("That packet is not in this practice");

    const nextVersion = locked.version + 1;
    const canonical = renderVersionText(locked.title, nextVersion, locked.blocks);
    const [snapshot] = await tx
      .insert(formVersions)
      .values({
        practiceId,
        formId,
        version: nextVersion,
        title: locked.title,
        blocks: locked.blocks,
        blocksHash: sha256Hex(canonical),
        publishedByUserId: actor.type === "user" ? actor.id : null,
      })
      .returning();

    await tx
      .update(forms)
      .set({ version: nextVersion, status: "live", updatedAt: new Date() })
      .where(eq(forms.id, formId));

    return snapshot;
  });

  await appendAuditEvent({
    practiceId,
    actorType: actor.type,
    actorId: actor.id,
    actorLabel: actor.label,
    action: "published",
    targetType: "form",
    targetId: formId,
    targetLabel: form.title,
    ip: actor.ip ?? null,
    metadata: { version: version.version, blocks: form.blocks.length },
  });

  return version;
}

/** The version an intake should be sent against — the newest published one. */
export async function latestVersion(
  practiceId: string,
  formId: string,
): Promise<FormVersion | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(formVersions)
    .where(and(eq(formVersions.formId, formId), eq(formVersions.practiceId, practiceId)))
    .orderBy(desc(formVersions.version))
    .limit(1);
  return row ?? null;
}

export async function getVersion(
  practiceId: string,
  versionId: string,
): Promise<FormVersion | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(formVersions)
    .where(and(eq(formVersions.id, versionId), eq(formVersions.practiceId, practiceId)));
  return row ?? null;
}

export async function versionsOf(practiceId: string, formId: string): Promise<FormVersion[]> {
  const db = getDb();
  return db
    .select()
    .from(formVersions)
    .where(and(eq(formVersions.formId, formId), eq(formVersions.practiceId, practiceId)))
    .orderBy(desc(formVersions.version));
}

/**
 * Does a published version still hash to what it claims?
 *
 * Nothing in the application can produce a mismatch — the row is never updated.
 * It exists so the compliance screen can *demonstrate* that rather than assert it.
 */
export function verifyVersion(version: FormVersion): { ok: boolean; computed: string } {
  const computed = sha256Hex(renderVersionText(version.title, version.version, version.blocks));
  return { ok: computed === version.blocksHash, computed };
}

/** How many packets went out on each version — shown beside the version stamp. */
export async function versionUsage(
  practiceId: string,
  formId: string,
): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select({ versionId: intakes.formVersionId, n: sql<number>`count(*)::int` })
    .from(intakes)
    .where(and(eq(intakes.practiceId, practiceId), eq(intakes.formId, formId)))
    .groupBy(intakes.formVersionId);
  return new Map(rows.map((r) => [r.versionId, Number(r.n)]));
}

