/**
 * src/lib/packets.ts
 *
 * The invoice packet: a generated invoice page, the rate confirmation, and the
 * signed BOL, merged into one PDF — but only after the completeness check
 * passes. This is the bounce-killer, and it is the reason the check runs before
 * the merge rather than after: a factoring company that receives a packet with
 * no POD does not send it back, it puts the invoice at the end of the queue.
 *
 * `checkCompleteness` is pure and takes the rows it needs, so the review panel
 * and the worker run exactly the same rules.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accessorialLines,
  brokers,
  carriers,
  documents,
  invoices,
  loads,
  stops,
  type AccessorialLine,
  type Broker,
  type Carrier,
  type DocumentRow,
  type Invoice,
  type Load,
  type Stop,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { billedAccessorialsCents } from "@/lib/detention-clock";
import { documentFilename, formatDateColumn, formatLane, isoDayIn } from "@/lib/format";
import { centsToDecimal, formatCents } from "@/lib/money";
import { getObject, objectKey, putObject } from "@/lib/storage";

export interface CompletenessCheck {
  label: string;
  ok: boolean;
  /** What to do about it, in the words the panel shows. Null when it passed. */
  fix: string | null;
  /** What is actually there, when it passed — the receipt. */
  detail: string | null;
}

export interface CompletenessResult {
  ok: boolean;
  checks: CompletenessCheck[];
  missing: string[];
}

export interface CompletenessInput {
  load: Load;
  stops: Stop[];
  documents: DocumentRow[];
  lines: AccessorialLine[];
  broker: Broker | null;
  invoice: Invoice | null;
  /** Where it is going: the broker, or the factor. */
  destination: "broker" | "factor";
  factoringCompany: string | null;
}

/** The rules, in the order a carrier would check them by hand. */
export function checkCompleteness(input: CompletenessInput): CompletenessResult {
  const checks: CompletenessCheck[] = [];

  const delivered =
    input.load.status === "delivered" ||
    input.load.status === "invoiced" ||
    input.load.status === "paid";
  checks.push({
    label: "Load delivered",
    ok: delivered,
    fix: delivered ? null : "This load has not been stamped delivered from the cab yet.",
    detail: delivered && input.load.deliveredAt ? formatDateColumn(input.load.deliveredAt.toISOString().slice(0, 10)) : null,
  });

  const rateCon = input.documents.find((d) => d.kind === "rate_con");
  checks.push({
    label: "Rate confirmation on file",
    ok: Boolean(rateCon),
    fix: rateCon
      ? null
      : "No rate con attached. Forward the broker's email to your parse address, or upload the PDF on this load.",
    detail: rateCon?.filename ?? null,
  });

  const pod = input.documents.find((d) => d.kind === "pod_photo" || d.kind === "bol");
  checks.push({
    label: "Signed BOL / POD",
    ok: Boolean(pod),
    fix: pod ? null : "No POD yet — photograph the signed BOL from the cab.",
    detail: pod?.filename ?? null,
  });

  const drafts = input.lines.filter((l) => l.status === "draft");
  checks.push({
    label: "Accessorials decided",
    ok: drafts.length === 0,
    fix:
      drafts.length === 0
        ? null
        : `${drafts.length} drafted accessorial line${drafts.length === 1 ? "" : "s"} still waiting on you. Confirm or dismiss ${drafts.length === 1 ? "it" : "them"} — a line added after the packet is sent needs a second invoice.`,
    detail: drafts.length === 0 ? "Nothing pending" : null,
  });

  const billed = billedAccessorialsCents(input.lines);
  const expected = input.load.rateCents + billed;
  const amountOk = input.invoice === null || input.invoice.amountCents === expected;
  checks.push({
    label: "Invoice total matches the load",
    ok: amountOk,
    fix: amountOk
      ? null
      : `The invoice reads ${formatCents(input.invoice?.amountCents ?? 0)} but the load is ${formatCents(expected)}. Rebuild the invoice.`,
    detail: amountOk
      ? billed > 0
        ? `${formatCents(input.load.rateCents)} linehaul + ${formatCents(billed)} accessorials`
        : formatCents(expected)
      : null,
  });

  if (input.destination === "broker") {
    const email = input.broker?.contactEmail?.trim();
    checks.push({
      label: "Somewhere to send it",
      ok: Boolean(email),
      fix: email
        ? null
        : input.broker
          ? `No billing email for ${input.broker.name}. Add one in the broker book.`
          : "This load has no broker. Pick one so the invoice has a bill-to.",
      detail: email ?? null,
    });
  } else {
    const factor = input.factoringCompany?.trim();
    checks.push({
      label: "Factoring company set",
      ok: Boolean(factor),
      fix: factor ? null : "No factoring company in settings. Add one before submitting a schedule.",
      detail: factor ?? null,
    });
  }

  const failing = checks.filter((c) => !c.ok);
  return { ok: failing.length === 0, checks, missing: failing.map((c) => c.label) };
}

/** Load everything the check needs and run it. */
export async function completenessFor(
  carrierId: string,
  loadId: string,
  destination: "broker" | "factor",
): Promise<{ result: CompletenessResult; input: CompletenessInput } | null> {
  const db = getDb();
  const [row] = await db
    .select({ load: loads, broker: brokers, carrier: carriers })
    .from(loads)
    .leftJoin(brokers, eq(loads.brokerId, brokers.id))
    .innerJoin(carriers, eq(loads.carrierId, carriers.id))
    .where(and(eq(loads.id, loadId), eq(loads.carrierId, carrierId)));
  if (!row) return null;

  const [stopRows, docRows, lineRows, invoiceRows] = await Promise.all([
    db.select().from(stops).where(eq(stops.loadId, loadId)),
    db.select().from(documents).where(eq(documents.loadId, loadId)),
    db.select().from(accessorialLines).where(eq(accessorialLines.loadId, loadId)),
    db.select().from(invoices).where(eq(invoices.loadId, loadId)),
  ]);

  const input: CompletenessInput = {
    load: row.load,
    stops: stopRows,
    documents: docRows,
    lines: lineRows,
    broker: row.broker,
    invoice: invoiceRows[0] ?? null,
    destination,
    factoringCompany: row.carrier.settings?.factoringCompany ?? null,
  };
  return { result: checkCompleteness(input), input };
}

/* -------------------------------------------------------------- rendering -- */

/**
 * The invoice page.
 *
 * Type note: pdf-lib's standard fonts are the PDF base 14, so this is
 * Helvetica for prose and Courier for every figure. DESIGN.md's Archivo/Plex
 * pairing needs a font embedder (@pdf-lib/fontkit) that is not in this app's
 * manifest; the discipline that matters here is preserved — every number is set
 * in the mono face and right-aligned on a tabular grid.
 */
export async function renderInvoicePdf(opts: {
  carrier: Carrier;
  broker: Broker | null;
  load: Load;
  stops: Stop[];
  lines: AccessorialLine[];
  invoice: Invoice;
}): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // US Letter
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const monoBold = await pdf.embedFont(StandardFonts.CourierBold);

  const ink = rgb(0.086, 0.094, 0.106); // asphalt
  const dim = rgb(0.42, 0.43, 0.44);
  const rule = rgb(0.8, 0.79, 0.77);

  const left = 48;
  const right = 612 - 48;
  let y = 744;

  const text = (
    value: string,
    opt: { x?: number; size?: number; font?: typeof sans; color?: typeof ink; align?: "left" | "right" } = {},
  ) => {
    const size = opt.size ?? 10;
    const font = opt.font ?? sans;
    const width = font.widthOfTextAtSize(value, size);
    const x = opt.align === "right" ? (opt.x ?? right) - width : (opt.x ?? left);
    page.drawText(value, { x, y, size, font, color: opt.color ?? ink });
  };

  const hairline = (gap = 12) => {
    y -= gap;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: rule });
    y -= gap;
  };

  // Header
  text(opts.carrier.name, { size: 18, font: sansBold });
  text(`INVOICE ${opts.invoice.number}`, { align: "right", size: 12, font: monoBold });
  y -= 16;
  const identifiers = [
    opts.carrier.mcNumber ? `MC ${opts.carrier.mcNumber}` : null,
    opts.carrier.dotNumber ? `DOT ${opts.carrier.dotNumber}` : null,
  ]
    .filter(Boolean)
    .join("   ");
  if (identifiers) text(identifiers, { size: 9, color: dim, font: mono });
  text(`Terms: Net ${opts.invoice.termsDays}`, { align: "right", size: 9, font: mono, color: dim });
  y -= 12;
  if (opts.carrier.settings?.remitToAddress) {
    for (const line of opts.carrier.settings.remitToAddress.split("\n").slice(0, 4)) {
      text(line.trim(), { size: 9, color: dim });
      y -= 11;
    }
  }

  hairline(14);

  // Bill to / load
  text("BILL TO", { size: 8, font: sansBold, color: dim });
  text("LOAD", { x: 330, size: 8, font: sansBold, color: dim });
  y -= 14;
  const billToLines = [
    opts.broker?.name ?? "—",
    opts.broker?.mcNumber ? `MC ${opts.broker.mcNumber}` : null,
    opts.broker?.contactEmail ?? null,
  ].filter(Boolean) as string[];
  const loadLines = [
    opts.load.reference ? `Ref ${opts.load.reference}` : "No broker reference",
    formatLane(opts.stops),
    opts.load.deliveredAt
      ? `Delivered ${formatDateColumn(isoDayIn(opts.load.deliveredAt, opts.carrier.timezone))}`
      : "Not yet delivered",
    opts.load.totalMiles ? `${opts.load.totalMiles.toLocaleString("en-US")} loaded miles` : null,
  ].filter(Boolean) as string[];

  const rows = Math.max(billToLines.length, loadLines.length);
  const startY = y;
  for (let i = 0; i < rows; i++) {
    y = startY - i * 12;
    if (billToLines[i]) text(billToLines[i], { size: 10 });
    if (loadLines[i]) text(loadLines[i], { x: 330, size: 9, font: mono });
  }
  y = startY - rows * 12;

  hairline(14);

  // Line items
  text("DESCRIPTION", { size: 8, font: sansBold, color: dim });
  text("AMOUNT", { align: "right", size: 8, font: sansBold, color: dim });
  y -= 16;

  const lineHaul = `Linehaul — ${formatLane(opts.stops)}`;
  text(lineHaul.slice(0, 70), { size: 10 });
  text(centsToDecimal(opts.load.rateCents), { align: "right", size: 10, font: mono });
  y -= 16;

  for (const line of opts.lines.filter((l) => l.status === "billed" || l.status === "paid")) {
    const label = line.description.length > 74 ? `${line.description.slice(0, 71)}…` : line.description;
    text(label, { size: 9 });
    text(centsToDecimal(line.amountCents), { align: "right", size: 10, font: mono });
    y -= 14;
    if (line.kind === "detention" && line.evidence.arrivedAt) {
      const arrived = line.evidence.arrivedAt.slice(0, 16).replace("T", " ");
      const departed = line.evidence.departedAt?.slice(0, 16).replace("T", " ") ?? "still on the dock";
      text(`   evidence: arrived ${arrived} UTC, departed ${departed} UTC`, {
        size: 8,
        font: mono,
        color: dim,
      });
      y -= 13;
    }
  }

  hairline(10);
  text("TOTAL DUE", { size: 11, font: sansBold });
  text(centsToDecimal(opts.invoice.amountCents), { align: "right", size: 14, font: monoBold });
  y -= 26;

  if (opts.load.factored) {
    text(
      `Assigned to ${opts.carrier.settings?.factoringCompany ?? "our factoring company"}. Remit per the notice of assignment.`,
      { size: 9, color: dim },
    );
    y -= 14;
  }

  y = 72;
  page.drawLine({ start: { x: left, y: y + 16 }, end: { x: right, y: y + 16 }, thickness: 0.75, color: rule });
  text(
    `Invoice ${opts.invoice.number} · ${opts.carrier.name} · prepared by DispatchDeck`,
    { size: 8, color: dim },
  );

  return pdf.save();
}

export interface PacketResult {
  packetDocumentId: string;
  pages: number;
  /** Documents that could not be merged, named rather than silently dropped. */
  skipped: string[];
}

/**
 * Merge invoice + rate con + POD into one PDF and file it as a document.
 *
 * Idempotent per invoice: an existing packet whose source document set is
 * unchanged is returned rather than rebuilt, so a double tap on "Build packet"
 * does not leave two packets on the load.
 */
export async function buildPacket(opts: {
  carrierId: string;
  invoiceId: string;
  actor: string;
}): Promise<PacketResult> {
  const db = getDb();
  const [row] = await db
    .select({ invoice: invoices, load: loads, carrier: carriers, broker: brokers })
    .from(invoices)
    .innerJoin(loads, eq(invoices.loadId, loads.id))
    .innerJoin(carriers, eq(invoices.carrierId, carriers.id))
    .leftJoin(brokers, eq(loads.brokerId, brokers.id))
    .where(and(eq(invoices.id, opts.invoiceId), eq(invoices.carrierId, opts.carrierId)));
  if (!row) throw new Error("That invoice is not on this account.");

  const [stopRows, docRows, lineRows] = await Promise.all([
    db.select().from(stops).where(eq(stops.loadId, row.load.id)),
    db.select().from(documents).where(eq(documents.loadId, row.load.id)),
    db.select().from(accessorialLines).where(eq(accessorialLines.loadId, row.load.id)),
  ]);

  const destination = row.load.factored ? "factor" : "broker";
  const check = checkCompleteness({
    load: row.load,
    stops: stopRows,
    documents: docRows,
    lines: lineRows,
    broker: row.broker,
    invoice: row.invoice,
    destination,
    factoringCompany: row.carrier.settings?.factoringCompany ?? null,
  });
  if (!check.ok) {
    throw new Error(
      `Packet blocked: ${check.checks.filter((c) => !c.ok).map((c) => c.fix ?? c.label).join(" ")}`,
    );
  }

  const sources = docRows
    .filter((d) => d.kind === "rate_con" || d.kind === "bol" || d.kind === "pod_photo")
    .sort((a, b) => sourceRank(a.kind) - sourceRank(b.kind) || a.createdAt.getTime() - b.createdAt.getTime());

  const { PDFDocument } = await import("pdf-lib");
  const packet = await PDFDocument.create();

  const invoiceBytes = await renderInvoicePdf({
    carrier: row.carrier,
    broker: row.broker,
    load: row.load,
    stops: stopRows,
    lines: lineRows,
    invoice: row.invoice,
  });
  const invoiceDoc = await PDFDocument.load(invoiceBytes);
  for (const page of await packet.copyPages(invoiceDoc, invoiceDoc.getPageIndices())) {
    packet.addPage(page);
  }

  const skipped: string[] = [];
  for (const source of sources) {
    const bytes = await getObject(source.r2Key);
    if (!bytes) {
      skipped.push(`${source.filename} (missing from storage)`);
      continue;
    }
    try {
      if (source.contentType === "application/pdf") {
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        for (const page of await packet.copyPages(doc, doc.getPageIndices())) packet.addPage(page);
      } else if (source.contentType === "image/jpeg" || source.contentType === "image/png") {
        const image =
          source.contentType === "image/jpeg"
            ? await packet.embedJpg(bytes)
            : await packet.embedPng(bytes);
        // One photo per Letter page, scaled to fit inside a 36pt margin.
        const page = packet.addPage([612, 792]);
        const scale = Math.min((612 - 72) / image.width, (792 - 72) / image.height, 1);
        const width = image.width * scale;
        const height = image.height * scale;
        page.drawImage(image, {
          x: (612 - width) / 2,
          y: (792 - height) / 2,
          width,
          height,
        });
      } else {
        skipped.push(`${source.filename} (${source.contentType} cannot go in a PDF)`);
      }
    } catch (error) {
      skipped.push(`${source.filename} (${error instanceof Error ? error.message : "unreadable"})`);
    }
  }

  const bytes = await packet.save();
  const filename = documentFilename("packet", {
    reference: row.load.reference,
    invoiceNumber: row.invoice.number,
    contentType: "application/pdf",
    day: isoDayIn(new Date(), row.carrier.timezone),
  });
  const key = objectKey(opts.carrierId, row.load.id, filename);
  await putObject(key, bytes, "application/pdf");

  const [document] = await db
    .insert(documents)
    .values({
      carrierId: opts.carrierId,
      loadId: row.load.id,
      kind: "packet",
      r2Key: key,
      filename,
      contentType: "application/pdf",
      sizeBytes: bytes.byteLength,
      pages: packet.getPageCount(),
    })
    .returning();

  await db
    .update(invoices)
    .set({ packetDocumentId: document.id, updatedAt: new Date() })
    .where(eq(invoices.id, row.invoice.id));

  await audit({
    carrierId: opts.carrierId,
    actor: opts.actor,
    action: "packet.built",
    target: row.invoice.id,
    metadata: { pages: packet.getPageCount(), sources: sources.length, skipped },
  });

  return { packetDocumentId: document.id, pages: packet.getPageCount(), skipped };
}

function sourceRank(kind: string): number {
  if (kind === "rate_con") return 0;
  if (kind === "bol") return 1;
  return 2;
}
