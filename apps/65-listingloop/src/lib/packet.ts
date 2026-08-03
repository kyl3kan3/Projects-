/**
 * src/lib/packet.ts
 *
 * The closing packet: the whole file as a zip a coordinator can hand to anyone.
 *
 * Anti-lock-in is a promise in the README, so this is built from the same data
 * the screens read and it works on every plan, including a lapsed one. Contents:
 *
 *   timeline.csv        every critical date with its derivation sentence
 *   checklist.csv       every task, owner, status, and the documents on it
 *   parties.csv         who was on the file
 *   commission.txt      the per-line math, exactly as the screen shows it
 *   activity.csv        the file's memory, oldest first
 *   summary.txt         the cover sheet
 *   timeline.pdf        the one-page timeline
 *   documents/…         every uploaded document, at every version
 */

import archiver from "archiver";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatCents, formatDollars } from "@/lib/commissions";
import { DATE_STATUS_LABELS, formatLong, formatShort } from "@/lib/dates";
import { DEAL_STATUS_LABELS, type DealFile } from "@/lib/deals";
import { activitySentence } from "@/lib/activity";
import type { ActivityRow } from "@/db/schema";
import { getBytes } from "@/lib/storage";
import { PARTY_ROLE_LABELS } from "@/lib/templates";

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(rows: unknown[][]): string {
  return `${rows.map((r) => r.map(csvCell).join(",")).join("\n")}\n`;
}

export function packetFilename(address: string): string {
  const slug = address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${slug || "closing-file"}-packet.zip`;
}

export function timelineCsv(file: DealFile): string {
  return csv([
    ["Date", "Deadline", "Status", "Owner", "How it was computed"],
    ...file.dates.map((d) => [
      d.dueOn,
      d.label,
      DATE_STATUS_LABELS[d.status],
      PARTY_ROLE_LABELS[
        (file.tasks.find((t) => t.id === d.taskId)?.ownerRole ?? "tc") as keyof typeof PARTY_ROLE_LABELS
      ] ?? "Coordinator",
      d.sentence,
    ]),
  ]);
}

export function checklistCsv(file: DealFile): string {
  return csv([
    ["Task", "Owner", "Status", "Document required", "Documents on file", "Due"],
    ...file.tasks.map((t) => [
      t.label,
      PARTY_ROLE_LABELS[t.ownerRole as keyof typeof PARTY_ROLE_LABELS] ?? t.ownerRole,
      t.status,
      t.docRequired ? "yes" : "no",
      t.documents.map((d) => `${d.filename} (v${d.version})`).join("; "),
      t.date?.dueOn ?? "",
    ]),
  ]);
}

export function partiesCsv(file: DealFile): string {
  return csv([
    ["Role", "Name", "Email", "Phone", "Reminders", "Portal"],
    ...file.parties.map((p) => [
      PARTY_ROLE_LABELS[p.role],
      p.name,
      p.email ?? "",
      p.phone ?? "",
      p.notify ? "on" : "off",
      p.portalTokenHash ? "issued" : "none",
    ]),
  ]);
}

export function commissionText(file: DealFile): string {
  const lines = [
    `Commission — ${file.deal.address}`,
    `Sale price: ${file.deal.priceCents ? formatDollars(file.deal.priceCents) : "not set"}`,
    "",
  ];
  for (const line of file.commissionLines) {
    lines.push(`${line.label.padEnd(38)} ${formatCents(line.amountCents).padStart(14)}`);
    if (line.detail) lines.push(`  ${line.detail}`);
  }
  return `${lines.join("\n")}\n`;
}

export function summaryText(file: DealFile): string {
  const lines = [
    `ListingLoop closing packet`,
    `${file.deal.address}`,
    file.deal.mlsNumber ? `MLS ${file.deal.mlsNumber}` : "",
    "",
    `Status:        ${DEAL_STATUS_LABELS[file.deal.status]}`,
    `Contract date: ${file.deal.contractDate ? formatLong(file.deal.contractDate) : "not set"}`,
    `Acceptance:    ${file.deal.acceptanceDate ? formatLong(file.deal.acceptanceDate) : "not set"}`,
    `Closing date:  ${file.deal.closingDate ? formatLong(file.deal.closingDate) : "not set"}`,
    `Checklist:     ${file.templateName ?? "none"}`,
    `Documents:     ${file.completeness.satisfied} of ${file.completeness.required} required on file`,
    `Exported:      ${new Date().toISOString()}`,
    "",
    "Every date in timeline.csv carries the sentence that computed it, so the",
    "arithmetic can be checked against the contract without this software.",
  ];
  return `${lines.filter((l) => l !== "").join("\n")}\n`;
}

export function activityCsv(rows: readonly ActivityRow[]): string {
  return csv([
    ["When", "Who", "What", "Detail"],
    ...rows.map((r) => {
      const { verb, body } = activitySentence(r);
      return [r.occurredAt.toISOString(), r.actor, verb, body];
    }),
  ]);
}

/**
 * pdf-lib's standard fonts are WinAnsi-encoded and throw on anything outside
 * Latin-1 — and this product's own sentences are full of typographic marks:
 * "Closing date (Jun 15) \u2212 1 business day \u2014 lands Friday". Drawing one
 * of those raised `WinAnsi cannot encode "\u2212"` and took the whole closing-packet
 * export down with a 500. Every string that reaches `drawText` goes through here.
 */
function winAnsi(text: string): string {
  return text
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\u2192/g, "->")
    .replace(/\u00B7/g, "-")
    // Anything still outside Latin-1 is dropped rather than crashing the export.
    .replace(/[^\u0000-\u00FF]/g, "");
}

/** A one-page timeline PDF: the ruled line, the nodes, the dates in mono. */
export async function timelinePdf(file: DealFile): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]); // A4 landscape
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const ink = rgb(0.149, 0.137, 0.11);
  const dim = rgb(0.435, 0.416, 0.357);
  const line = rgb(0.886, 0.863, 0.788);
  const keybox = rgb(0.549, 0.231, 0.29);
  const cedar = rgb(0.369, 0.498, 0.353);

  page.drawText(winAnsi(file.deal.address), { x: 48, y: 540, size: 20, font: serif, color: ink });
  page.drawText(
    winAnsi(
      `${DEAL_STATUS_LABELS[file.deal.status]} - ${file.dates.length} critical dates - exported ${file.today}`,
    ),
    { x: 48, y: 518, size: 10, font: sans, color: dim },
  );

  const dates = [...file.dates].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const left = 60;
  const right = 782;
  const y = 430;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: line });

  if (dates.length > 0) {
    const first = dates[0].dueOn;
    const last = dates[dates.length - 1].dueOn;
    const span = Math.max(1, Date.parse(last) - Date.parse(first));
    for (const [i, d] of dates.entries()) {
      const t = (Date.parse(d.dueOn) - Date.parse(first)) / span;
      const x = left + t * (right - left);
      const colour = d.status === "met" ? cedar : d.status === "missed" || d.status === "at_risk" ? keybox : ink;
      page.drawRectangle({ x: x - 3, y: y - 3, width: 6, height: 6, color: colour });
      const above = i % 2 === 0;
      page.drawText(winAnsi(formatShort(d.dueOn)), {
        x: x - 14,
        y: above ? y + 12 : y - 18,
        size: 8,
        font: mono,
        color: ink,
      });
      page.drawText(winAnsi(d.label).slice(0, 26), {
        x: x - 14,
        y: above ? y + 24 : y - 30,
        size: 7,
        font: sans,
        color: dim,
      });
    }
  } else {
    page.drawText("No computed dates on this file yet.", {
      x: left,
      y: y + 12,
      size: 10,
      font: sans,
      color: dim,
    });
  }

  let listY = 340;
  page.drawText("Every date, and how it was computed", { x: 48, y: listY, size: 12, font: serif, color: ink });
  listY -= 18;
  for (const d of dates.slice(0, 16)) {
    page.drawText(winAnsi(d.dueOn), { x: 48, y: listY, size: 9, font: mono, color: ink });
    page.drawText(winAnsi(d.label).slice(0, 34), { x: 130, y: listY, size: 9, font: sans, color: ink });
    page.drawText(winAnsi(d.sentence).slice(0, 92), { x: 330, y: listY, size: 8, font: sans, color: dim });
    listY -= 15;
    if (listY < 40) break;
  }

  return pdf.save();
}

export interface PacketInput {
  file: DealFile;
  activity: readonly ActivityRow[];
}

/**
 * Build the zip. Returns a Buffer rather than a stream: a closing file is a few
 * megabytes at most, and buffering keeps the route simple and the byte count
 * exact so the download shows a progress bar.
 */
export async function buildPacket(input: PacketInput): Promise<Buffer> {
  const { file } = input;
  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => {
    archive.on("end", resolve);
    archive.on("error", reject);
    archive.on("warning", (err) => {
      if (err.code !== "ENOENT") reject(err);
    });
  });

  archive.append(summaryText(file), { name: "summary.txt" });
  archive.append(timelineCsv(file), { name: "timeline.csv" });
  archive.append(checklistCsv(file), { name: "checklist.csv" });
  archive.append(partiesCsv(file), { name: "parties.csv" });
  archive.append(commissionText(file), { name: "commission.txt" });
  archive.append(activityCsv(input.activity), { name: "activity.csv" });
  archive.append(Buffer.from(await timelinePdf(file)), { name: "timeline.pdf" });

  for (const doc of file.documents) {
    const bytes = await getBytes(doc.id, doc.r2Key);
    if (!bytes) {
      archive.append(
        `This document could not be read from storage when the packet was built.\nLabel: ${doc.label}\nFile: ${doc.filename}\nVersion: ${doc.version}\n`,
        { name: `documents/MISSING-${doc.label}-v${doc.version}.txt` },
      );
      continue;
    }
    const safe = doc.filename.replace(/[^A-Za-z0-9._-]/g, "_");
    archive.append(bytes, { name: `documents/${doc.label.replace(/[^A-Za-z0-9 ._-]/g, "_")}/v${doc.version}-${safe}` });
  }

  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}
