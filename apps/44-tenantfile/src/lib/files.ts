/**
 * Exporting the File as a PDF — the document a landlord hands to a mediator, a
 * small-claims clerk, or the tenant who says the deposit was never cashed.
 *
 * The append path and the timeline reads live in file-events.ts; this module only
 * renders. Order is fixed and matches ROADMAP's acceptance criterion:
 * tenancy terms → lease and signatures → the full rent ledger with a running
 * balance → the event timeline → every maintenance thread with its photographs.
 *
 * Completeness is a promise rather than a nicety, so it is checked in code
 * (`assertExportComplete`) before the bytes are stored: every charge and every
 * settled payment must appear. An export that quietly omits a payment is worse
 * than no export at all.
 */

import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  fileEvents,
  leases,
  maintenanceRequests,
  properties,
  requestMessages,
  tenancies,
  units,
} from "@/db/schema";
import { chargeLabel, type Ledger } from "@/lib/ledger-core";
import { loadLedger } from "@/lib/ledger-read";
import { stitch } from "@/lib/file-events";
import { formatDate, formatMoney, formatPeriod, isoDateOf, type IsoDate } from "@/lib/money";
import { renderPdf, type PdfBlock } from "@/lib/pdf";
import { storage, storeUpload } from "@/lib/storage";

export interface FileExportResult {
  key: string;
  bytes: Buffer;
  pages: number;
}

export interface FileExportDraft {
  blocks: PdfBlock[];
  title: string;
  subtitle: string;
  ledger: Ledger;
}

export async function buildFileExport(tenancyId: string): Promise<FileExportDraft> {
  const db = getDb();
  const [row] = await db
    .select({ tenancy: tenancies, unit: units, property: properties })
    .from(tenancies)
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(tenancies.id, tenancyId));
  if (!row) throw new Error("No such tenancy");

  const { tenancy, unit, property } = row;
  const today = isoDateOf(new Date());
  const ledger = await loadLedger(tenancyId, today);
  const [timeline, leaseRows, requests] = await Promise.all([
    db.select().from(fileEvents).where(eq(fileEvents.tenancyId, tenancyId)).orderBy(asc(fileEvents.occurredAt)),
    db.select().from(leases).where(eq(leases.tenancyId, tenancyId)),
    db
      .select()
      .from(maintenanceRequests)
      .where(eq(maintenanceRequests.tenancyId, tenancyId))
      .orderBy(asc(maintenanceRequests.createdAt)),
  ]);
  const lease = leaseRows[0];

  const blocks: PdfBlock[] = [];

  blocks.push({ type: "label", text: "Tenancy" });
  blocks.push({ type: "row", left: "Unit", right: unit.label, strong: true });
  blocks.push({
    type: "body",
    text: [property.address, property.city, property.state, property.postalCode].filter(Boolean).join(", "),
  });
  blocks.push({ type: "label", text: "Tenant" });
  blocks.push({ type: "body", text: tenancy.tenantNames.join(", ") || "Not recorded" });
  if (tenancy.tenantEmails.length) blocks.push({ type: "mono", text: tenancy.tenantEmails.join("  ") });
  blocks.push({ type: "space", height: 6 });
  blocks.push({
    type: "row",
    left: "Term",
    right: `${formatDate(tenancy.startsOn as IsoDate, { year: true })} - ${
      tenancy.endsOn ? formatDate(tenancy.endsOn as IsoDate, { year: true }) : "month to month"
    }`,
  });
  blocks.push({ type: "row", left: "Monthly rent", right: formatMoney(tenancy.rentCents) });
  blocks.push({ type: "row", left: "Security deposit", right: formatMoney(tenancy.depositCents) });
  blocks.push({ type: "row", left: "Rent due each month on day", right: String(tenancy.rentDueDay) });
  blocks.push({ type: "row", left: "Tenancy status", right: tenancy.status });

  if (lease) {
    blocks.push({ type: "space", height: 10 });
    blocks.push({ type: "label", text: "Lease" });
    blocks.push({ type: "row", left: "Status", right: lease.status.replace(/_/g, " ") });
    blocks.push({ type: "row", left: "Source", right: lease.source === "upload" ? "landlord's own document" : "state template shell" });
    if (lease.signedAt) blocks.push({ type: "row", left: "Fully signed", right: lease.signedAt.toISOString().slice(0, 10) });
    for (const sig of lease.signatures) {
      blocks.push({
        type: "bullet",
        text: `${sig.role === "landlord" ? "Landlord" : "Tenant"}: "${sig.typedName}" signed ${sig.signedAt} from ${sig.ip}`,
      });
    }
    if (lease.fields.uploadSha256) {
      blocks.push({
        type: "bullet",
        text: `Attached document ${lease.fields.uploadFilename ?? ""} · SHA-256 ${lease.fields.uploadSha256}`,
      });
    }
  }

  blocks.push({ type: "pagebreak" });
  blocks.push({ type: "title", text: "Rent ledger" });
  blocks.push({
    type: "body",
    text: "Every charge and every settled payment, in date order, with the balance owed after each line. Bank payments still clearing are listed at the end and are not counted in the balance.",
  });
  blocks.push({ type: "rule" });
  blocks.push({ type: "row", left: "Date and line", right: "Amount    Balance", muted: true });

  for (const line of ledger.lines) {
    blocks.push({
      type: "row",
      left: `${line.date}  ${line.label}${line.detail ? ` · ${line.detail}` : ""}`,
      right: `${line.deltaCents < 0 ? "-" : " "}${formatMoney(Math.abs(line.deltaCents))}  ${formatMoney(line.balanceCents)}`,
      muted: line.kind === "payment",
    });
  }

  blocks.push({ type: "rule" });
  blocks.push({ type: "row", left: "Total charged", right: formatMoney(ledger.chargedCents), strong: true });
  blocks.push({ type: "row", left: "Total paid", right: formatMoney(ledger.paidCents), strong: true });
  blocks.push({
    type: "row",
    left: ledger.creditCents > 0 ? "Credit on account" : "Balance owed",
    right: formatMoney(ledger.creditCents > 0 ? ledger.creditCents : ledger.balanceCents),
    strong: true,
  });
  if (ledger.processingCents > 0) {
    blocks.push({
      type: "row",
      left: "Bank payments still clearing (not in the balance)",
      right: formatMoney(ledger.processingCents),
      muted: true,
    });
  }

  blocks.push({ type: "pagebreak" });
  blocks.push({ type: "title", text: "The File" });
  blocks.push({
    type: "body",
    text: `${timeline.length} event${timeline.length === 1 ? "" : "s"}, oldest first. Each was appended when it happened; nothing in this list has been edited since.`,
  });
  blocks.push({ type: "rule" });
  for (const event of timeline) {
    blocks.push({
      type: "row",
      left: `${event.occurredAt.toISOString().slice(0, 10)}  ${event.summary}`,
      right: event.amountCents != null ? formatMoney(event.amountCents) : "",
    });
    if (event.detail) blocks.push({ type: "body", text: event.detail });
  }

  if (requests.length > 0) {
    blocks.push({ type: "pagebreak" });
    blocks.push({ type: "title", text: "Maintenance" });
    for (const request of requests) {
      const messages = await db
        .select()
        .from(requestMessages)
        .where(eq(requestMessages.requestId, request.id))
        .orderBy(asc(requestMessages.sentAt));

      blocks.push({ type: "heading", text: request.title });
      blocks.push({
        type: "row",
        left: `${request.status} · ${request.priority} · opened by the ${request.openedBy} on ${request.createdAt
          .toISOString()
          .slice(0, 10)}`,
        right: request.costCents != null ? formatMoney(request.costCents) : "",
        muted: true,
      });
      for (const message of messages) {
        blocks.push({
          type: "row",
          left: `${message.author === "tenant" ? "Tenant" : "Landlord"} · ${message.sentAt.toISOString().slice(0, 16).replace("T", " ")}`,
          right: "",
          muted: true,
        });
        blocks.push({ type: "body", text: message.body });
        for (const key of message.photoKeys) {
          const object = await storage().get(key).catch(() => null);
          if (object) {
            blocks.push({
              type: "image",
              jpeg: object.bytes,
              caption: `${key.split("/").pop()} · sent ${message.sentAt.toISOString().slice(0, 10)}`,
            });
          }
        }
      }
      blocks.push({ type: "rule" });
    }
  }

  const title = `The File - ${property.address}, ${unit.label}`;
  const subtitle = `${tenancy.tenantNames.join(", ") || "Tenancy"} · ${formatPeriod(
    (tenancy.startsOn as string).slice(0, 7),
  )} to ${tenancy.endsOn ? formatPeriod((tenancy.endsOn as string).slice(0, 7)) : "open"} · exported ${today}`;

  return { blocks, title, subtitle, ledger };
}

/**
 * The completeness guarantee, as a function so a test can hold us to it: every
 * charge and every settled payment must appear as a line in the export.
 */
export function assertExportComplete(blocks: PdfBlock[], ledger: Ledger): void {
  const rendered = blocks
    .filter((b): b is Extract<PdfBlock, { type: "row" }> => b.type === "row")
    .map((b) => `${b.left} ${b.right}`)
    .join("\n");

  for (const state of ledger.charges) {
    const label = chargeLabel(state.charge);
    if (!rendered.includes(label)) {
      throw new Error(`Export is missing charge ${state.charge.id} (${label})`);
    }
  }
  for (const line of ledger.lines) {
    if (line.kind !== "payment") continue;
    if (!rendered.includes(line.label)) {
      throw new Error(`Export is missing payment line "${line.label}"`);
    }
  }
}

/** Render and store the export. Returns the storage key plus the bytes. */
export async function exportFilePdf(tenancyId: string, landlordId: string): Promise<FileExportResult> {
  const { blocks, title, subtitle, ledger } = await buildFileExport(tenancyId);
  assertExportComplete(blocks, ledger);

  const bytes = renderPdf({
    title,
    subtitle,
    footer: "Exported from TenantFile · a record of what happened, not legal advice",
    blocks,
  });
  const put = await storeUpload(landlordId, "export", { bytes, contentType: "application/pdf" });

  await stitch({
    tenancyId,
    kind: "note",
    summary: "The File exported as PDF",
    detail: `${Math.max(1, Math.round(bytes.byteLength / 1024))}KB`,
  });

  return { key: put.key, bytes, pages: countPages(bytes) };
}

export function countPages(pdf: Buffer): number {
  const m = /\/Type \/Pages \/Count (\d+)/.exec(pdf.toString("latin1"));
  return m ? Number(m[1]) : 0;
}
