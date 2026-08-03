/**
 * src/lib/notes.ts
 *
 * The working copy: inline edits, per-section regeneration, and the plain-text
 * rendering used by the copy-to-EHR button and the PDF.
 *
 * Every mutation here calls `assertUnsigned` first. That is the whole edit
 * surface — there is no other function anywhere that writes `notes.sections`
 * except the pipeline (which writes the initial draft) and these two.
 */

import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  notes,
  sessions,
  type Note,
  type NoteSection,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { assertUnsigned, versionChain, type SignedVersion } from "@/lib/signing";
import { draftSections } from "@/lib/drafting";
import { noteContext, type NoteContext } from "@/lib/sessions";
import { SECTION_LABEL } from "@/lib/templates";
import { formatDate, formatStamp, shortHash, wordCount } from "@/lib/format";
import { provenanceLine } from "@/lib/honesty";
import { unionSpans } from "@/lib/trace";

export class NoteEditError extends Error {}

export interface EditMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Save one section's text.
 *
 * The drafting-time sentence map is left untouched: `lib/trace` re-matches it
 * against the new text, so a sentence the clinician rewrote quietly stops
 * claiming a source instead of keeping a citation that no longer applies.
 */
export async function saveSection(
  practiceId: string,
  noteId: string,
  sectionKey: string,
  text: string,
  userId: string,
  meta: EditMeta = {},
): Promise<Note> {
  const db = getDb();
  const ctx = await noteContext(practiceId, noteId);
  if (!ctx) throw new NoteEditError("That note no longer exists");
  assertUnsigned(ctx.note);

  const existing = ctx.note.sections.find((s) => s.key === sectionKey);
  if (!existing && !ctx.template.sections.some((s) => s.key === sectionKey)) {
    throw new NoteEditError("That section is not part of this note's template");
  }

  const next: NoteSection[] = ctx.template.sections.map((templateSection) => {
    const current =
      ctx.note.sections.find((s) => s.key === templateSection.key) ??
      ({ key: templateSection.key, text: "", sourceSpans: [], sentences: [] } as NoteSection);
    if (templateSection.key !== sectionKey) return current;
    return { ...current, text: text.trim() };
  });

  const [row] = await db
    .update(notes)
    .set({ sections: next, updatedAt: new Date() })
    .where(eq(notes.id, noteId))
    .returning();

  await recordAudit({
    practiceId,
    actorId: userId,
    action: "edited",
    targetKind: "note",
    targetId: noteId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: {
      sectionKey,
      wordCount: wordCount(text),
      version: ctx.note.currentVersion,
    },
  });

  return row;
}

/**
 * Regenerate exactly one section.
 *
 * The clinician's edits to every *other* section are untouched — that is the
 * point of per-section drafting, and the reason this function replaces one entry
 * rather than re-running the whole note.
 */
export async function regenerateSection(
  practiceId: string,
  noteId: string,
  sectionKey: string,
  userId: string,
  meta: EditMeta = {},
): Promise<Note> {
  const db = getDb();
  const ctx = await noteContext(practiceId, noteId);
  if (!ctx) throw new NoteEditError("That note no longer exists");
  assertUnsigned(ctx.note);

  const section = ctx.template.sections.find((s) => s.key === sectionKey);
  if (!section) throw new NoteEditError("That section is not part of this note's template");

  const segments =
    ctx.transcript && !ctx.transcript.purgedAt ? ctx.transcript.segments : [];
  if (segments.length === 0 && ctx.session.captureKind !== "shorthand") {
    throw new NoteEditError(
      "The transcript for this session has been purged, so a section cannot be regenerated. Edit the text directly.",
    );
  }

  const draft = await draftSections({
    sections: ctx.template.sections,
    format: ctx.note.format,
    modality: ctx.template.modality,
    segments,
    shorthandText: ctx.session.shorthandText,
    durationMinutes: ctx.session.durationMinutes,
    onlyKeys: [sectionKey],
  });
  const fresh = draft.sections[0];
  if (!fresh) throw new NoteEditError("The drafter returned nothing for that section");

  const next = ctx.template.sections.map((templateSection) => {
    const current =
      ctx.note.sections.find((s) => s.key === templateSection.key) ??
      ({ key: templateSection.key, text: "", sourceSpans: [], sentences: [] } as NoteSection);
    if (templateSection.key !== sectionKey) return current;
    return {
      key: fresh.key,
      text: fresh.text,
      sourceSpans: unionSpans(fresh.sourceSpans),
      sentences: fresh.sentences,
    };
  });

  const [row] = await db
    .update(notes)
    .set({
      sections: next,
      model: draft.model,
      inputTokens: ctx.note.inputTokens + draft.inputTokens,
      outputTokens: ctx.note.outputTokens + draft.outputTokens,
      costMicros: ctx.note.costMicros + draft.costMicros,
      updatedAt: new Date(),
    })
    .where(eq(notes.id, noteId))
    .returning();

  await recordAudit({
    practiceId,
    actorId: userId,
    action: "redrafted",
    targetKind: "note",
    targetId: noteId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: {
      sectionKey,
      model: draft.model,
      fixture: draft.fixture,
      costMicros: draft.costMicros,
      sentenceCount: fresh.sentences.length,
    },
  });

  return row;
}

/* ------------------------------------------------------------- rendering */

export interface RenderOptions {
  timeZone: string;
  signerName: string;
  signerCredentials: string;
}

/**
 * The plain-text note — what the "Copy for your EHR" button puts on the
 * clipboard and what the PDF lays out. Includes the signature block when signed,
 * and the provenance line when any part of it came from a fixture provider.
 */
export function renderNoteText(
  ctx: NoteContext,
  chain: SignedVersion[],
  options: RenderOptions,
): string {
  const lines: string[] = [];
  lines.push(
    `${ctx.client.displayLabel} — ${ctx.template.name}`,
    `Session held ${formatDate(ctx.session.heldAt, options.timeZone)} · ${
      ctx.session.durationMinutes ? `${ctx.session.durationMinutes} min` : "duration not recorded"
    } · ${ctx.session.captureKind}`,
    "",
  );

  for (const templateSection of ctx.template.sections) {
    const section = ctx.note.sections.find((s) => s.key === templateSection.key);
    lines.push((SECTION_LABEL[templateSection.key] ?? templateSection.label).toUpperCase());
    lines.push(section?.text?.trim() || "(not completed)");
    lines.push("");
  }

  const signed = chain.filter((v) => v.signature);
  if (signed.length > 0) {
    lines.push("—".repeat(40));
    for (const entry of signed) {
      const sig = entry.signature!;
      lines.push(
        `${entry.version.reason === "amendment" ? "Amendment signed" : "Signed"} by ${options.signerName}, ${sig.signerCredentials}`,
        `version ${sig.version} · ${formatStamp(sig.signedAt, options.timeZone)} · ${sig.contentHash}`,
        entry.intact ? "" : "WARNING: stored content no longer matches this signature.",
      );
    }
  } else {
    lines.push("—".repeat(40), "UNSIGNED DRAFT — not a clinical record until signed.");
  }

  const provenance = provenanceLine({
    transcriptProvider: ctx.transcript?.provider,
    noteModel: ctx.note.model,
  });
  if (provenance) lines.push("", provenance);

  return lines.filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Short hash for the UI, kept next to the full one so both are available. */
export function hashPair(hash: string): { short: string; full: string } {
  return { short: shortHash(hash), full: hash };
}

export async function noteWithChain(
  practiceId: string,
  noteId: string,
): Promise<{ ctx: NoteContext; chain: SignedVersion[] } | null> {
  const ctx = await noteContext(practiceId, noteId);
  if (!ctx) return null;
  return { ctx, chain: await versionChain(noteId) };
}

/** Signed notes in a date range — the records-request export. */
export async function signedNotesInRange(
  practiceId: string,
  from: Date,
  to: Date,
): Promise<{ noteId: string; heldAt: Date; clientLabel: string }[]> {
  const db = getDb();
  const rows = await db
    .select({
      noteId: notes.id,
      heldAt: sessions.heldAt,
      clientLabel: clients.displayLabel,
    })
    .from(notes)
    .innerJoin(sessions, eq(sessions.id, notes.sessionId))
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(
      and(
        eq(clients.practiceId, practiceId),
        // Typed operators, not a Date inside a raw fragment.
        gte(sessions.heldAt, from),
        lte(sessions.heldAt, to),
        sql`${notes.status} in ('signed')`,
      ),
    )
    .orderBy(sessions.heldAt);
  return rows;
}
