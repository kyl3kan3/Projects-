/**
 * src/lib/pdf.ts
 *
 * The "here it is, counsel" artifact.
 *
 * Everything on the page comes from the signature row: the waiver text as it was
 * signed, the answers and initials given, the signature mark, and the evidence
 * summary. The waiver definition is never read, which is the whole point — a
 * records request answered eighteen months later renders the same document
 * whatever the operator has done to their waiver since.
 *
 * Layout is deterministic for a given signature: same input, same page count and
 * same placement, so two people pulling the same record get the same document.
 * `generatedAt` is an explicit parameter for that reason.
 *
 * Type: pdf-lib's standard faces (Helvetica for prose, Courier for the mono
 * evidence lines). DESIGN.md asks for embedded Barlow and JetBrains Mono
 * subsets; embedding a custom face needs `@pdf-lib/fontkit`, which is outside
 * this app's manifest, so the roles are preserved (proportional vs monospaced,
 * same hierarchy) with the standard faces standing in.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  exportLog,
  locations,
  participants,
  signatures,
  type Location,
  type Participant,
  type Signature,
} from "@/db/schema";
import { evidenceSummary, stampDate } from "@/lib/signatures";
import { clauseConfig, liabilityConfig, questionConfig } from "@/lib/waivers";
import { incidentFile } from "@/lib/incidents";
import { bulkPdfKey, incidentPdfKey, putObject, signaturePdfKey } from "@/lib/storage";

/**
 * pdf-lib's standard fonts encode WinAnsi only, and it *throws* on anything
 * outside it. An export that crashes because a participant's name or a pasted
 * clause contains one unusual character would be the worst possible failure in
 * this product — the records request is exactly when the archive has to work.
 *
 * So every string is normalised before it is measured or drawn: the typography
 * that turns up in real pasted text is mapped to its ASCII equivalent, accented
 * Latin passes through unchanged (WinAnsi covers it), and anything genuinely
 * outside the encoding becomes "?" rather than an exception. A name in a
 * non-Latin script therefore renders as question marks in the PDF while staying
 * intact in the database and on screen — a visible limitation, not a lost record,
 * and it lifts as soon as a Unicode font is embedded.
 */
const CHAR_MAP: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "⇒": "=>",
  "•": "-",
  "·": "-",
  "✓": "[x]",
  "✔": "[x]",
  "✗": "[ ]",
  "≥": ">=",
  "≤": "<=",
  "≈": "~",
  "″": '"',
  "′": "'",
  " ": " ",
  " ": " ",
  "​": "",
  "‑": "-",
};

export function winAnsi(text: string): string {
  let out = "";
  for (const ch of text) {
    const mapped = CHAR_MAP[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = ch.codePointAt(0)!;
    // Latin-1 range plus the WinAnsi punctuation block pdf-lib handles.
    if (code === 9 || code === 10 || (code >= 32 && code <= 255) || (code >= 0x2013 && code <= 0x2026)) {
      out += ch;
    } else {
      out += "?";
    }
  }
  return out;
}

const PAGE_W = 595.28; // A4 portrait
const PAGE_H = 841.89;
const MARGIN = 48;
const INK = rgb(0.078, 0.09, 0.102); // granite
const MUTED = rgb(0.38, 0.42, 0.4);
const RULE = rgb(0.82, 0.82, 0.78);
const TRAIL = rgb(0.824, 0.439, 0.227); // the one accent, used once per page

export interface RenderedPdf {
  bytes: Uint8Array;
  pageCount: number;
  filename: string;
  /** Non-null when the render was cached to object storage. */
  s3Key: string | null;
}

interface Fonts {
  sans: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
}

/** A cursor that flows text down pages, adding pages as it runs out of room. */
class Flow {
  page: PDFPage;
  y: number;
  pages = 1;

  constructor(
    private doc: PDFDocument,
    private fonts: Fonts,
  ) {
    this.page = doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  private ensure(height: number): void {
    if (this.y - height >= MARGIN) return;
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages += 1;
    this.y = PAGE_H - MARGIN;
  }

  gap(h: number): void {
    this.y -= h;
  }

  rule(): void {
    this.ensure(12);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.75,
      color: RULE,
    });
    this.y -= 12;
  }

  wrap(raw: string, font: PDFFont, size: number, width: number): string[] {
    const text = winAnsi(raw);
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      if (!paragraph.trim()) {
        lines.push("");
        continue;
      }
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) > width && line) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  text(
    body: string,
    opts: { size?: number; font?: PDFFont; color?: typeof INK; leading?: number; indent?: number } = {},
  ): void {
    const size = opts.size ?? 10.5;
    const font = opts.font ?? this.fonts.sans;
    const leading = opts.leading ?? size * 1.45;
    const indent = opts.indent ?? 0;
    const width = PAGE_W - MARGIN * 2 - indent;
    for (const line of this.wrap(body, font, size, width)) {
      this.ensure(leading);
      if (line) {
        this.page.drawText(line, {
          x: MARGIN + indent,
          y: this.y - size,
          size,
          font,
          color: opts.color ?? INK,
        });
      }
      this.y -= leading;
    }
  }

  label(text: string): void {
    this.ensure(16);
    this.page.drawText(winAnsi(text.toUpperCase()), {
      x: MARGIN,
      y: this.y - 8,
      size: 8,
      font: this.fonts.bold,
      color: MUTED,
    });
    this.y -= 16;
  }

  heading(text: string, size = 15): void {
    this.ensure(size * 1.6);
    this.page.drawText(winAnsi(text), {
      x: MARGIN,
      y: this.y - size,
      size,
      font: this.fonts.bold,
      color: INK,
    });
    this.y -= size * 1.6;
  }

  keyValue(key: string, value: string): void {
    const size = 10;
    const keyWidth = 150;
    const lines = this.wrap(value, this.fonts.sans, size, PAGE_W - MARGIN * 2 - keyWidth);
    this.ensure(Math.max(1, lines.length) * size * 1.45 + 2);
    this.page.drawText(winAnsi(key), {
      x: MARGIN,
      y: this.y - size,
      size,
      font: this.fonts.sans,
      color: MUTED,
    });
    lines.forEach((line, i) => {
      if (i > 0) this.ensure(size * 1.45);
      this.page.drawText(line, {
        x: MARGIN + keyWidth,
        y: this.y - size,
        size,
        font: this.fonts.sans,
        color: INK,
      });
      this.y -= size * 1.45;
    });
    if (!lines.length) this.y -= size * 1.45;
  }

  mono(text: string, size = 8.5): void {
    this.text(text, { size, font: this.fonts.mono, color: MUTED, leading: size * 1.5 });
  }
}

async function fonts(doc: PDFDocument): Promise<Fonts> {
  return {
    sans: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
}

function drawSignatureMark(flow: Flow, sig: Signature, f: Fonts): void {
  flow.label("Signature");
  const boxH = 76;
  flow.gap(0);
  const top = flow.y;
  flow.page.drawRectangle({
    x: MARGIN,
    y: top - boxH,
    width: PAGE_W - MARGIN * 2,
    height: boxH,
    borderColor: RULE,
    borderWidth: 0.75,
  });

  if (sig.signatureKind === "drawn" && sig.signatureData.startsWith("M")) {
    try {
      flow.page.drawSvgPath(sig.signatureData, {
        x: MARGIN + 12,
        y: top - 12,
        scale: 0.55,
        borderColor: INK,
        borderWidth: 1.4,
      });
    } catch {
      flow.page.drawText(winAnsi("[drawn signature - see stored path data]"), {
        x: MARGIN + 12,
        y: top - 40,
        size: 10,
        font: f.sans,
        color: MUTED,
      });
    }
  } else {
    flow.page.drawText(winAnsi(sig.signatureData), {
      x: MARGIN + 12,
      y: top - 44,
      size: 20,
      font: f.sans,
      color: INK,
    });
    flow.page.drawText("Typed signature", {
      x: MARGIN + 12,
      y: top - 64,
      size: 8,
      font: f.sans,
      color: MUTED,
    });
  }
  flow.y = top - boxH - 16;
}

function signatureSection(
  flow: Flow,
  f: Fonts,
  input: { signature: Signature; participant: Participant; location: Location; timeZone: string },
): void {
  const { signature: sig, participant, location } = input;
  const tz = input.timeZone;

  // The one accent on the page: a short blaze rule under the title.
  flow.heading(sig.waiverTitle, 17);
  flow.page.drawLine({
    start: { x: MARGIN, y: flow.y + 6 },
    end: { x: MARGIN + 42, y: flow.y + 6 },
    thickness: 2,
    color: TRAIL,
  });
  flow.gap(10);
  flow.mono(
    `VERSION ${sig.waiverVersion} · ${location.name.toUpperCase()} · ${stampDate(sig.signedAt, tz)}`,
  );
  flow.gap(6);
  flow.rule();

  flow.label("Participant");
  flow.keyValue("Name", `${participant.firstName} ${participant.lastName}`);
  flow.keyValue("Date of birth", participant.dob ?? "not recorded");
  if (sig.minorAtSigning) {
    flow.keyValue("Age at signing", `${sig.signerAgeYears ?? "?"} (a minor on this waiver)`);
    flow.keyValue("Signed by", `${sig.signerName} — ${sig.guardianRelationship ?? "guardian"}`);
    flow.keyValue(
      "Age of majority",
      `${sig.ageOfMajorityAtSigning} at the time this waiver was signed`,
    );
  } else {
    flow.keyValue("Age at signing", sig.signerAgeYears != null ? String(sig.signerAgeYears) : "not recorded");
    flow.keyValue("Signed by", `${sig.signerName} (in their own name)`);
  }
  if (participant.email) flow.keyValue("Email", participant.email);
  if (participant.phone) flow.keyValue("Phone", participant.phone);
  if (participant.emergencyContact) {
    flow.keyValue(
      "Emergency contact",
      `${participant.emergencyContact.name} · ${participant.emergencyContact.phone} · ${participant.emergencyContact.relationship}`,
    );
  }
  flow.gap(8);

  drawSignatureMark(flow, sig, f);

  flow.label("Evidence summary");
  for (const line of evidenceSummary(sig, participant.dob, tz).lines) {
    flow.text(line, { size: 9, color: MUTED, leading: 13 });
  }
  flow.gap(10);
  flow.rule();

  const clauses = sig.signedBlocks.filter((b) => b.kind === "initialed_clause");
  if (clauses.length) {
    flow.label("Initialed clauses");
    for (const b of clauses) {
      const given = sig.initials[b.key] ?? "—";
      flow.text(`[${given.toUpperCase()}]  ${clauseConfig(b).text}`, { size: 9.5, leading: 13 });
      flow.gap(6);
    }
    flow.gap(4);
  }

  const questions = sig.signedBlocks.filter((b) => b.kind === "question");
  if (questions.length) {
    flow.label("Answers given");
    for (const b of questions) {
      const c = questionConfig(b);
      flow.keyValue(c.label, sig.answers[b.key]?.trim() || "no answer given");
    }
    flow.gap(8);
  }

  flow.label("Waiver text as signed");
  for (const b of sig.signedBlocks) {
    if (b.kind === "liability_text") {
      const c = liabilityConfig(b);
      flow.gap(4);
      flow.heading(c.heading, 11);
      flow.text(c.body, { size: 9.5, leading: 13 });
      flow.gap(4);
    } else if (b.kind === "initialed_clause") {
      flow.gap(4);
      flow.text(`${clauseConfig(b).text}`, { size: 9.5, leading: 13, indent: 14 });
      flow.gap(4);
    }
  }
  flow.gap(6);
  flow.text(sig.disclosureText, { size: 9, color: MUTED, leading: 12.5 });
}

function footer(doc: PDFDocument, f: Fonts, generatedAt: Date, note: string): void {
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    page.drawText(
      winAnsi(`${note}  ·  page ${i + 1} of ${pages.length}  ·  produced ${generatedAt.toISOString()}`),
      { x: MARGIN, y: 26, size: 7.5, font: f.mono, color: MUTED },
    );
  });
}

/* ---------------------------------------------------- single signed waiver */

export async function renderSignedWaiverPdf(
  accountId: string,
  signatureId: string,
  opts: { generatedAt?: Date; cache?: boolean } = {},
): Promise<RenderedPdf | null> {
  const db = getDb();
  const [row] = await db
    .select({ signature: signatures, participant: participants, location: locations })
    .from(signatures)
    .innerJoin(participants, eq(participants.id, signatures.participantId))
    .innerJoin(locations, eq(locations.id, signatures.locationId))
    .where(and(eq(signatures.id, signatureId), eq(signatures.accountId, accountId)));
  if (!row) return null;

  const generatedAt = opts.generatedAt ?? new Date();
  const doc = await PDFDocument.create();
  doc.setTitle(`${row.signature.waiverTitle} — ${row.participant.firstName} ${row.participant.lastName}`);
  doc.setProducer("WaiverWing");
  doc.setCreationDate(generatedAt);
  doc.setModificationDate(generatedAt);

  const f = await fonts(doc);
  const flow = new Flow(doc, f);
  signatureSection(flow, f, {
    signature: row.signature,
    participant: row.participant,
    location: row.location,
    timeZone: row.location.timezone,
  });
  footer(doc, f, generatedAt, `WaiverWing record ${row.signature.id}`);

  const bytes = await doc.save();
  const key = signaturePdfKey(row.signature.id, row.signature.textHash);
  const stored = opts.cache === false ? null : await putObject(key, bytes);

  return {
    bytes,
    pageCount: doc.getPageCount(),
    filename: `waiver-${row.participant.lastName.toLowerCase()}-${row.signature.id.slice(0, 8)}.pdf`,
    s3Key: stored,
  };
}

/* ------------------------------------------------------------ bulk export */

export const BULK_EXPORT_CAP = 500;

export interface BulkScope {
  from: Date;
  to: Date;
  locationId?: string | null;
}

export async function bulkExportPdf(
  accountId: string,
  scope: BulkScope,
  opts: { generatedAt?: Date; userId?: string | null } = {},
): Promise<RenderedPdf & { included: number; truncated: boolean }> {
  const db = getDb();
  const where = [
    eq(signatures.accountId, accountId),
    gte(signatures.signedAt, scope.from),
    lte(signatures.signedAt, scope.to),
  ];
  if (scope.locationId) where.push(eq(signatures.locationId, scope.locationId));

  const rows = await db
    .select({ signature: signatures, participant: participants, location: locations })
    .from(signatures)
    .innerJoin(participants, eq(participants.id, signatures.participantId))
    .innerJoin(locations, eq(locations.id, signatures.locationId))
    .where(and(...where))
    .orderBy(desc(signatures.signedAt))
    .limit(BULK_EXPORT_CAP + 1);

  const truncated = rows.length > BULK_EXPORT_CAP;
  const included = truncated ? rows.slice(0, BULK_EXPORT_CAP) : rows;

  const generatedAt = opts.generatedAt ?? new Date();
  const doc = await PDFDocument.create();
  doc.setTitle(`WaiverWing export ${scope.from.toISOString().slice(0, 10)} to ${scope.to.toISOString().slice(0, 10)}`);
  doc.setProducer("WaiverWing");
  doc.setCreationDate(generatedAt);
  doc.setModificationDate(generatedAt);
  const f = await fonts(doc);

  const flow = new Flow(doc, f);
  flow.heading("Signed waiver export", 18);
  flow.mono(
    `${included.length} RECORDS · ${scope.from.toISOString().slice(0, 10)} TO ${scope.to.toISOString().slice(0, 10)}`,
  );
  flow.gap(8);
  flow.rule();
  flow.label("Manifest");
  for (const r of included) {
    flow.text(
      `${r.participant.lastName}, ${r.participant.firstName} — ${r.signature.waiverTitle} v${r.signature.waiverVersion} — ${stampDate(r.signature.signedAt, r.location.timezone)}${r.signature.minorAtSigning ? ` — signed by ${r.signature.signerName}` : ""}`,
      { size: 9, leading: 12.5 },
    );
  }
  if (truncated) {
    flow.gap(10);
    flow.text(
      `This export was capped at ${BULK_EXPORT_CAP} records. Narrow the date range to pull the rest — nothing was silently dropped.`,
      { size: 9.5, color: MUTED },
    );
  }

  for (const r of included) {
    // Each record starts on its own page: a records request gets handed on in
    // pieces, and a waiver that begins halfway down someone else's page is a
    // waiver that gets photocopied wrong.
    flow.page = doc.addPage([PAGE_W, PAGE_H]);
    flow.pages += 1;
    flow.y = PAGE_H - MARGIN;
    signatureSection(flow, f, {
      signature: r.signature,
      participant: r.participant,
      location: r.location,
      timeZone: r.location.timezone,
    });
  }

  footer(doc, f, generatedAt, `WaiverWing bulk export`);
  const bytes = await doc.save();
  const key = bulkPdfKey(accountId, generatedAt.toISOString().replace(/[:.]/g, "-"));
  const stored = await putObject(key, bytes);

  await db.insert(exportLog).values({
    accountId,
    userId: opts.userId ?? null,
    kind: "bulk_pdf",
    scope: {
      from: scope.from.toISOString(),
      to: scope.to.toISOString(),
      locationId: scope.locationId ?? null,
      included: included.length,
      truncated,
    },
    s3Key: stored,
    byteSize: bytes.byteLength,
  });

  return {
    bytes,
    pageCount: doc.getPageCount(),
    filename: `waiverwing-export-${scope.from.toISOString().slice(0, 10)}.pdf`,
    s3Key: stored,
    included: included.length,
    truncated,
  };
}

/** CSV manifest of the same scope — Front Desk and above. */
export async function bulkExportCsv(accountId: string, scope: BulkScope): Promise<string> {
  const db = getDb();
  const where = [
    eq(signatures.accountId, accountId),
    gte(signatures.signedAt, scope.from),
    lte(signatures.signedAt, scope.to),
  ];
  if (scope.locationId) where.push(eq(signatures.locationId, scope.locationId));

  const rows = await db
    .select({ signature: signatures, participant: participants, location: locations })
    .from(signatures)
    .innerJoin(participants, eq(participants.id, signatures.participantId))
    .innerJoin(locations, eq(locations.id, signatures.locationId))
    .where(and(...where))
    .orderBy(desc(signatures.signedAt));

  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    "participant_last_name",
    "participant_first_name",
    "date_of_birth",
    "email",
    "phone",
    "minor_at_signing",
    "signed_by",
    "guardian_relationship",
    "waiver_title",
    "waiver_version",
    "location",
    "channel",
    "signed_at",
    "expires_at",
    "text_sha256",
    "signature_id",
  ].join(",");

  const lines = rows.map((r) =>
    [
      esc(r.participant.lastName),
      esc(r.participant.firstName),
      esc(r.participant.dob),
      esc(r.participant.email),
      esc(r.participant.phone),
      esc(r.signature.minorAtSigning ? "yes" : "no"),
      esc(r.signature.signerName),
      esc(r.signature.guardianRelationship),
      esc(r.signature.waiverTitle),
      esc(r.signature.waiverVersion),
      esc(r.location.name),
      esc(r.signature.channel),
      esc(r.signature.signedAt.toISOString()),
      esc(r.signature.expiresAt?.toISOString() ?? "never"),
      esc(r.signature.textHash),
      esc(r.signature.id),
    ].join(","),
  );

  return [header, ...lines].join("\n");
}

/* ---------------------------------------------------------- incident file */

export async function incidentFilePdf(
  accountId: string,
  incidentId: string,
  opts: { generatedAt?: Date; userId?: string | null } = {},
): Promise<RenderedPdf | null> {
  const file = await incidentFile(accountId, incidentId);
  if (!file) return null;

  const db = getDb();
  const [location] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, file.incident.locationId));

  const generatedAt = opts.generatedAt ?? new Date();
  const tz = location?.timezone ?? "UTC";
  const doc = await PDFDocument.create();
  doc.setTitle(`Incident file — ${file.incident.title}`);
  doc.setProducer("WaiverWing");
  doc.setCreationDate(generatedAt);
  doc.setModificationDate(generatedAt);
  const f = await fonts(doc);
  const flow = new Flow(doc, f);

  flow.heading("Incident file", 18);
  flow.page.drawLine({
    start: { x: MARGIN, y: flow.y + 6 },
    end: { x: MARGIN + 42, y: flow.y + 6 },
    thickness: 2,
    color: TRAIL,
  });
  flow.gap(8);
  flow.mono(
    `OCCURRED ${stampDate(file.incident.occurredAt, tz)} · ${(location?.name ?? "").toUpperCase()} · ${file.incident.status.toUpperCase()}`,
  );
  flow.gap(8);
  flow.rule();
  flow.heading(file.incident.title, 13);
  if (file.incident.whereText) flow.keyValue("Where", file.incident.whereText);
  flow.keyValue("Logged by", file.loggedBy ?? "not recorded");
  flow.keyValue("Logged at", file.incident.createdAt.toISOString());
  flow.gap(6);
  flow.label("What happened");
  flow.text(file.incident.description, { size: 10, leading: 14 });
  flow.gap(10);
  flow.rule();

  flow.label(`People linked (${file.entries.length})`);
  for (const e of file.entries) {
    flow.text(`${e.participant.firstName} ${e.participant.lastName}`, {
      size: 11,
      font: f.bold,
    });
    if (e.signature) {
      flow.mono(
        `WAIVER IN FORCE · ${e.signature.waiverTitle.toUpperCase()} V${e.signature.waiverVersion} · SIGNED ${stampDate(e.signature.signedAt, tz)}`,
      );
    } else {
      // The honest record. A blank here is far better than a waiver signed after
      // the fact quietly standing in for one that never existed.
      flow.mono("NO WAIVER IN FORCE AT THE TIME OF THIS INCIDENT");
    }
    if (e.link.note) flow.text(e.link.note, { size: 9.5, color: MUTED, leading: 13 });
    flow.gap(8);
  }

  for (const e of file.entries) {
    if (!e.signature || !location) continue;
    flow.page = doc.addPage([PAGE_W, PAGE_H]);
    flow.pages += 1;
    flow.y = PAGE_H - MARGIN;
    signatureSection(flow, f, {
      signature: e.signature,
      participant: e.participant,
      location,
      timeZone: tz,
    });
  }

  footer(doc, f, generatedAt, `WaiverWing incident ${file.incident.id}`);
  const bytes = await doc.save();
  const key = incidentPdfKey(accountId, incidentId, generatedAt.toISOString().replace(/[:.]/g, "-"));
  const stored = await putObject(key, bytes);

  await db.insert(exportLog).values({
    accountId,
    userId: opts.userId ?? null,
    kind: "incident_pdf",
    scope: { incidentId, linked: file.entries.length },
    s3Key: stored,
    byteSize: bytes.byteLength,
  });

  return {
    bytes,
    pageCount: doc.getPageCount(),
    filename: `incident-${incidentId.slice(0, 8)}.pdf`,
    s3Key: stored,
  };
}
