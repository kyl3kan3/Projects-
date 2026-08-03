/**
 * src/lib/binder.ts
 *
 * The audit binder: one PDF per property or project containing the compliance
 * matrix and every current certificate behind it.
 *
 * This is the artefact the whole product is for — the answer to "show me proof
 * every vendor on this building was insured." So it is built to be defensible
 * rather than pretty: the matrix names the requirement each vendor was measured
 * against, prints every deficiency sentence in full, states the date and time it
 * was generated, and lists the sha256 of each embedded certificate so the binder
 * can be checked against the files it came from.
 *
 * When a certificate cannot be embedded — an encrypted PDF, a corrupt upload — the
 * binder says so on its own page with the hash, rather than quietly omitting a
 * document. An audit binder with a silent gap in it is worse than no binder.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatDate, formatStamp } from "@/lib/dates";
import { formatCents } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/compliance";
import { summariseTemplate } from "@/lib/requirements";
import { getCertificateBytes } from "@/lib/storage";
import type { Org, Property } from "@/db/schema";
import type { EngagementView } from "@/lib/verdicts";

const INK = rgb(0.12, 0.14, 0.13);
const DIM = rgb(0.41, 0.44, 0.42);
const RULE = rgb(0.85, 0.86, 0.84);
const CLAIM = rgb(0.64, 0.27, 0.23);

const PAGE = { w: 612, h: 792, margin: 48 };

export interface BinderResult {
  bytes: Uint8Array;
  /** Certificates that could not be embedded, with the reason. */
  omitted: Array<{ vendor: string; sha256: string; reason: string }>;
  certificateCount: number;
}

interface Cursor {
  page: import("pdf-lib").PDFPage;
  y: number;
}

export async function buildBinder(
  org: Org,
  property: Property,
  views: EngagementView[],
  at: Date = new Date(),
): Promise<BinderResult> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${property.name} — insurance compliance binder`);
  doc.setAuthor(org.name);
  doc.setSubject(`Certificate of insurance binder generated ${at.toISOString()}`);
  doc.setProducer("CertShield");
  doc.setCreationDate(at);

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const mono = await doc.embedFont(StandardFonts.Courier);

  let cursor: Cursor = { page: doc.addPage([PAGE.w, PAGE.h]), y: PAGE.h - PAGE.margin };

  const newPage = () => {
    cursor = { page: doc.addPage([PAGE.w, PAGE.h]), y: PAGE.h - PAGE.margin };
  };
  const need = (space: number) => {
    if (cursor.y - space < PAGE.margin) newPage();
  };
  const text = (
    value: string,
    opts: {
      size?: number;
      font?: typeof body;
      color?: typeof INK;
      x?: number;
      gap?: number;
      maxWidth?: number;
    } = {},
  ) => {
    const size = opts.size ?? 9;
    const font = opts.font ?? body;
    const x = opts.x ?? PAGE.margin;
    const maxWidth = opts.maxWidth ?? PAGE.w - PAGE.margin - x;
    for (const row of wrap(value, font, size, maxWidth)) {
      need(size + 4);
      cursor.y -= size + (opts.gap ?? 3);
      cursor.page.drawText(row, { x, y: cursor.y, size, font, color: opts.color ?? INK });
    }
  };
  const rule = (gap = 8) => {
    need(gap + 2);
    cursor.y -= gap;
    cursor.page.drawLine({
      start: { x: PAGE.margin, y: cursor.y },
      end: { x: PAGE.w - PAGE.margin, y: cursor.y },
      thickness: 0.75,
      color: RULE,
    });
  };

  /* ------------------------------------------------------------ cover sheet */

  text(org.name, { size: 10, font: bold, color: DIM });
  text(`${property.name} — insurance compliance binder`, { size: 18, font: bold, gap: 8 });
  if (property.address) text(property.address, { size: 9, color: DIM });
  text(`Generated ${formatStamp(at, org.timezone)} (${org.timezone})`, {
    size: 9,
    font: mono,
    color: DIM,
  });
  text(
    `${views.length} active engagement${views.length === 1 ? "" : "s"}. Verdicts are as of the date above; each was computed from the certificate reproduced in this binder against the requirement named beside it.`,
    { size: 9, color: DIM },
  );
  rule(12);

  /* ------------------------------------------------------- compliance matrix */

  text("Compliance matrix", { size: 13, font: bold, gap: 6 });

  if (!views.length) {
    text(
      "No vendors are engaged at this property yet. Add engagements on the property page and every certificate on file will appear here.",
      { size: 9, color: DIM },
    );
  }

  for (const view of views) {
    need(72);
    cursor.y -= 8;
    text(view.vendor.name, { size: 11, font: bold });
    text(
      [view.vendor.trade, `Requirement: ${view.template.name}`].filter(Boolean).join(" · "),
      { size: 8, color: DIM },
    );
    text(STATUS_LABEL[view.verdict.status].toUpperCase(), {
      size: 9,
      font: bold,
      color: view.verdict.status === "compliant" ? INK : CLAIM,
    });

    if (view.certificate) {
      const lines = view.coverages
        .map(
          (c) =>
            `${c.label}: ${formatCents(c.limitCents)}  policy ${c.policyNumber ?? "—"}  ${formatDate(
              c.effectiveOn,
            )} to ${formatDate(c.expiresOn)}`,
        )
        .join("\n");
      for (const row of lines.split("\n").filter(Boolean)) {
        text(row, { size: 8, font: mono, color: DIM, x: PAGE.margin + 12 });
      }
      text(
        `Carrier ${view.certificate.carrier ?? "—"} · holder ${view.certificate.holderName ?? "—"} · sha256 ${view.certificate.sha256}`,
        { size: 7, font: mono, color: DIM, x: PAGE.margin + 12 },
      );
    } else {
      text("No certificate on file.", { size: 8, color: CLAIM, x: PAGE.margin + 12 });
    }

    for (const deficiency of view.verdict.deficiencies) {
      text(deficiency.reason, { size: 8.5, color: CLAIM, x: PAGE.margin + 12 });
    }
    text(`Requirement in full: ${summariseTemplate(view.template)}`, {
      size: 7,
      color: DIM,
      x: PAGE.margin + 12,
    });
    rule(8);
  }

  /* ----------------------------------------------------- embedded documents */

  const omitted: BinderResult["omitted"] = [];
  let certificateCount = 0;

  for (const view of views) {
    if (!view.certificate) continue;
    const stored = await getCertificateBytes({
      key: view.certificate.r2Key,
      certificateId: view.certificate.id,
    });
    if (!stored) {
      omitted.push({
        vendor: view.vendor.name,
        sha256: view.certificate.sha256,
        reason: "The stored document could not be read back from storage.",
      });
      continue;
    }
    try {
      const source = await PDFDocument.load(stored.bytes, { ignoreEncryption: true });
      const pages = await doc.copyPages(source, source.getPageIndices());
      for (const page of pages) doc.addPage(page);
      certificateCount += 1;
    } catch (err) {
      omitted.push({
        vendor: view.vendor.name,
        sha256: view.certificate.sha256,
        reason: err instanceof Error ? err.message : "The PDF could not be opened.",
      });
    }
  }

  if (omitted.length) {
    newPage();
    text("Documents that could not be reproduced", { size: 13, font: bold, gap: 6 });
    text(
      "These certificates are on file and were used to compute the verdicts above, but their PDFs could not be embedded in this binder. They are listed here rather than silently omitted.",
      { size: 9, color: DIM },
    );
    for (const row of omitted) {
      rule(8);
      text(row.vendor, { size: 10, font: bold });
      text(`sha256 ${row.sha256}`, { size: 7.5, font: mono, color: DIM });
      text(row.reason, { size: 8.5, color: CLAIM });
    }
  }

  return { bytes: await doc.save(), omitted, certificateCount };
}

/** Greedy word wrap against the embedded font's real metrics. */
function wrap(
  value: string,
  font: import("pdf-lib").PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const clean = sanitise(value);
  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const rows: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) rows.push(current);
    // A single word longer than the line (a sha256) is hard-split.
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > maxWidth) {
      let cut = rest.length;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
      rows.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  if (current) rows.push(current);
  return rows;
}

/**
 * The standard fonts are WinAnsi-encoded, and a character outside it makes pdf-lib
 * throw mid-binder. Typographic punctuation from the app's own copy is folded down
 * to ASCII rather than risking that.
 */
function sanitise(value: string): string {
  return value
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/·/g, "|")
    .replace(/≥/g, ">=")
    .replace(/…/g, "...")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E]/g, "?");
}
