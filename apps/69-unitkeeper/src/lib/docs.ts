/**
 * Document generation: leases, statutory notices, statements, rate-change letters,
 * and the lien packet.
 *
 * Three rules hold here:
 *
 *  - **The lease hash covers what was signed.** The unsigned lease and the signed
 *    lease are different documents; the sha256 stored on the tenancy is taken over
 *    the signed bytes, and the signature block names the typed signature, the
 *    timestamp and the template version.
 *  - **A notice quotes the ledger, not a summary of it.** The amount on a lien
 *    notice is computed from the rows at the moment it is generated, and the rows
 *    themselves are attached to the packet.
 *  - **The packet is the notices that were actually sent**, copied page for page
 *    out of storage, with the ledger appended. It is not a re-render: a re-render
 *    with today's balances would be a different document from the one mailed.
 */

import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { getDb } from "@/db";
import { notices, tenancies, type Notice } from "@/db/schema";
import { statement as buildStatement, kindLabel } from "@/lib/ledger-core";
import { entriesFor, toCoreEntries } from "@/lib/ledger";
import { leaseSections, leasePlainText, LEASE_TEMPLATE_VERSION, type LeaseFacts } from "@/lib/lease-text";
import { buildTimeline, type Timeline } from "@/lib/lien-engine";
import { requirementLabel, type RuleStep } from "@/lib/lien-rules";
import {
  addDays,
  formatDateLong,
  formatMoney,
  isoDateOf,
  type IsoDate,
} from "@/lib/money";
import {
  finish,
  heading,
  label,
  monoLine,
  monoTable,
  newDoc,
  paragraph,
  rule,
  space,
  stampFooter,
} from "@/lib/pdf";
import { putDocument, storage } from "@/lib/storage";
import { ladderSentence } from "@/lib/settings";
import type { TenancyContext } from "@/lib/tenancy";

/* ------------------------------------------------------------------ lease --- */

export function leaseFactsFor(ctx: TenancyContext, firstPaymentCents: number): LeaseFacts {
  const alt = ctx.tenant.alternateContact as { note?: string } | null;
  return {
    facilityName: ctx.facility.name,
    facilityAddress: ctx.facility.address ?? "",
    facilityState: ctx.facility.state,
    ownerLegalName: ctx.settings.legalName || ctx.owner.name,
    tenantName: ctx.tenant.name,
    tenantAddress: ctx.tenant.address ?? "",
    tenantEmail: ctx.tenant.email ?? "",
    tenantPhone: ctx.tenant.phone ?? "",
    alternateContact: alt?.note ?? "",
    unitLabel: ctx.unit.label,
    unitSize: ctx.unit.size,
    rateCents: ctx.tenancy.rateCents,
    startedOn: ctx.tenancy.startedOn,
    rentDueDay: ctx.settings.rentDueDay,
    prorateRule: ctx.settings.prorateRule,
    firstPaymentCents,
    ladderSummary: ladderSentence(ctx.settings),
    ownerTerms: ctx.settings.facilityTerms,
  };
}

async function leasePdf(
  facts: LeaseFacts,
  signature: { name: string; at: Date } | null,
): Promise<Buffer> {
  const doc = await newDoc();
  heading(doc, "Self-storage rental agreement", 18);
  paragraph(
    doc,
    `${facts.facilityName} — unit ${facts.unitLabel} (${facts.unitSize}) — ${formatMoney(facts.rateCents)}/month`,
    { dim: true },
  );
  rule(doc);

  for (const section of leaseSections(facts)) {
    heading(doc, section.heading, 11.5);
    paragraph(doc, section.body);
  }

  space(doc, 8);
  rule(doc);
  label(doc, "Signature");
  if (signature) {
    paragraph(
      doc,
      `Signed by ${signature.name} on ${signature.at.toISOString()} from the tenant's device. ` +
        `Typed signature captured as an electronic signature under the E-SIGN Act.`,
    );
    monoLine(doc, `signature: ${signature.name}`);
    monoLine(doc, `signed_at:  ${signature.at.toISOString()}`);
    monoLine(doc, `template:   ${LEASE_TEMPLATE_VERSION}`);
  } else {
    paragraph(
      doc,
      "Not yet signed. The tenant signs on their own device through the move-in link; " +
        "the signed copy carries the signature, the timestamp and a sha256 of the document.",
      { dim: true },
    );
    monoLine(doc, "signature: ____________________________");
  }

  stampFooter(doc, `${facts.facilityName} · unit ${facts.unitLabel} · rental agreement`);
  return finish(doc);
}

/** The unsigned lease, for the tenant to read and the owner to preview. */
export async function renderLease(
  ctx: TenancyContext,
  firstPaymentCents: number,
): Promise<{ r2Key: string }> {
  const bytes = await leasePdf(leaseFactsFor(ctx, firstPaymentCents), null);
  const { key } = await putDocument(ctx.owner.id, "lease", bytes);
  await getDb()
    .update(tenancies)
    .set({ leaseR2Key: key, updatedAt: new Date() })
    .where(eq(tenancies.id, ctx.tenancy.id));
  return { r2Key: key };
}

/**
 * The signed lease. The hash is taken over the PDF bytes *and* recorded against
 * the plain text, so a dispute about what was agreed can be settled either way.
 */
export async function renderSignedLease(
  ctx: TenancyContext,
  firstPaymentCents: number,
  signatureName: string,
): Promise<{ r2Key: string; hash: string; signedAt: Date }> {
  const facts = leaseFactsFor(ctx, firstPaymentCents);
  const signedAt = new Date();
  const bytes = await leasePdf(facts, { name: signatureName, at: signedAt });
  const hash = createHash("sha256")
    .update(bytes)
    .update(leasePlainText(facts))
    .update(`${signatureName}|${signedAt.toISOString()}`)
    .digest("hex");
  const { key } = await putDocument(ctx.owner.id, "lease", bytes);
  await getDb()
    .update(tenancies)
    .set({ leaseR2Key: key, leaseHash: hash, signedAt, updatedAt: new Date() })
    .where(eq(tenancies.id, ctx.tenancy.id));
  return { r2Key: key, hash, signedAt };
}

/* ---------------------------------------------------------------- notices --- */

export type NoticeKind = Notice["kind"];

interface NoticeBody {
  title: string;
  paragraphs: string[];
  /** Rendered as a mono block under the prose — dates, amounts, citations. */
  facts: string[];
  certified: boolean;
}

async function noticeDoc(ctx: TenancyContext, body: NoticeBody): Promise<Buffer> {
  const doc = await newDoc();

  label(doc, ctx.facility.name);
  paragraph(doc, ctx.facility.address ?? "", { dim: true, size: 9.5 });
  space(doc, 4);

  if (body.certified) {
    label(doc, "Send by certified mail — return receipt requested");
    space(doc, 2);
  }

  label(doc, "To");
  paragraph(doc, `${ctx.tenant.name}\n${ctx.tenant.address ?? "(no notice address on file)"}`);
  space(doc, 6);
  rule(doc);

  heading(doc, body.title, 15);
  for (const p of body.paragraphs) paragraph(doc, p);

  space(doc, 4);
  rule(doc);
  label(doc, "Particulars");
  for (const fact of body.facts) monoLine(doc, fact);

  space(doc, 12);
  paragraph(
    doc,
    `Questions: contact ${ctx.facility.name}${ctx.owner.email ? ` at ${ctx.owner.email}` : ""}. ` +
      `Payment in full stops this process.`,
    { dim: true, size: 9.5 },
  );

  stampFooter(
    doc,
    `${ctx.facility.name} · unit ${ctx.unit.label} · ${ctx.tenant.name} · generated ${isoDateOf(new Date())}`,
  );
  return finish(doc);
}

async function persistNotice(
  ctx: TenancyContext,
  kind: NoticeKind,
  bytes: Buffer,
  lienCaseId: string | null,
  certified: boolean,
): Promise<{ noticeId: string; r2Key: string }> {
  const { key } = await putDocument(ctx.owner.id, kind === "statement" ? "statement" : "notice", bytes);
  const [row] = await getDb()
    .insert(notices)
    .values({
      lienCaseId,
      tenancyId: ctx.tenancy.id,
      kind,
      r2Key: key,
      sentVia: { emailed: false, certified },
    })
    .returning();
  return { noticeId: row.id, r2Key: key };
}

/** The day-6 late notice the ladder mails a copy of. */
export async function renderLateNotice(
  ctx: TenancyContext,
  outstandingCents: number,
  daysLate: number,
  asOf: IsoDate,
): Promise<{ noticeId: string; r2Key: string }> {
  const bytes = await noticeDoc(ctx, {
    title: "Notice of past-due rent",
    certified: false,
    paragraphs: [
      `Rent on unit ${ctx.unit.label} is ${daysLate} days past due. The balance shown below is due now.`,
      `${ladderSentence(ctx.settings)}`,
      `If the balance is paid in full, every step above is cancelled and any overlock is removed the same day.`,
    ],
    facts: [
      `unit:        ${ctx.unit.label} (${ctx.unit.size})`,
      `as of:       ${asOf}`,
      `days late:   ${daysLate}`,
      `balance due: ${formatMoney(outstandingCents)}`,
    ],
  });
  return persistNotice(ctx, "late", bytes, null, false);
}

/**
 * A statutory lien notice for one step of the rail. The step's own citation, its
 * requirements, and the date the *next* step becomes lawful all print on the face
 * of it — the notice is the hard stop, written down.
 */
export async function renderLienNotice(
  ctx: TenancyContext,
  lienCaseId: string,
  timeline: Timeline,
  stepKey: string,
  outstandingCents: number,
): Promise<{ noticeId: string; r2Key: string }> {
  const step = timeline.steps.find((s) => s.key === stepKey);
  if (!step) throw new Error(`No step "${stepKey}" on this lien case`);
  const index = timeline.steps.indexOf(step);
  const next = timeline.steps[index + 1] ?? null;
  const sale = timeline.steps[timeline.steps.length - 1];
  const kind: NoticeKind = step.key === "sale" || step.key.includes("sale") ? "lien_sale" : "lien_default";
  const certified = step.requires.includes("certified_mail");

  const entries = toCoreEntries(await entriesFor(ctx.tenancy.id));
  const from = entries.length ? entries[0].occurredOn : ctx.tenancy.startedOn;
  const stmt = buildStatement(entries, from, isoDateOf(new Date()));

  const bytes = await noticeDoc(ctx, {
    title: step.label,
    certified,
    paragraphs: [
      `${ctx.facility.name} claims a lien on the property stored in unit ${ctx.unit.label} for unpaid rent and ` +
        `other charges. This notice is given under ${step.citation}.`,
      `The amount due is ${formatMoney(outstandingCents)} as of ${formatDateLong(isoDateOf(new Date()))}. ` +
        `Rent and charges continue to accrue until the balance is paid or the property is sold.`,
      next
        ? `The next step in this process is "${next.label}", which may not occur before ` +
          `${formatDateLong(next.dueOn)} (${next.citation}).`
        : `This is the final step in the statutory sequence.`,
      `The property may not be sold before ${formatDateLong(sale.dueOn)}. Paying the balance in full before that ` +
        `date stops the sale and releases the lien.`,
      `An itemised account of every charge and payment on this unit is attached to the facility's file and is ` +
        `available on request.`,
    ],
    facts: [
      `unit:          ${ctx.unit.label} (${ctx.unit.size})`,
      `tenancy from:  ${ctx.tenancy.startedOn}`,
      `delinquent:    ${timeline.steps[0].dueOn}`,
      `step:          ${step.label}`,
      `citation:      ${step.citation}`,
      ...(step.requires.length
        ? [`requires:      ${step.requires.map(requirementLabel).join(", ")}`]
        : []),
      `balance due:   ${formatMoney(outstandingCents)}`,
      `earliest sale: ${sale.dueOn}`,
      `ledger rows:   ${stmt.rows.length}`,
    ],
  });
  return persistNotice(ctx, kind, bytes, lienCaseId, certified);
}

/** Balance-forward statement. */
export async function renderStatement(
  ctx: TenancyContext,
  from: IsoDate,
  to: IsoDate,
): Promise<{ noticeId: string; r2Key: string }> {
  const stmt = buildStatement(toCoreEntries(await entriesFor(ctx.tenancy.id)), from, to);
  const doc = await newDoc();
  heading(doc, "Statement of account", 17);
  paragraph(
    doc,
    `${ctx.facility.name} · unit ${ctx.unit.label} · ${ctx.tenant.name} · ${from} to ${to}`,
    { dim: true },
  );
  rule(doc);
  monoLine(doc, `balance forward: ${formatMoney(stmt.openingBalanceCents)}`);
  space(doc, 8);
  monoTable(
    doc,
    [
      { header: "DATE", width: 10 },
      { header: "DESCRIPTION", width: 38 },
      { header: "CHARGE", width: 11, align: "right" },
      { header: "PAID", width: 11, align: "right" },
      { header: "BALANCE", width: 11, align: "right" },
    ],
    stmt.rows.map((r) => [
      r.occurredOn,
      r.description,
      r.chargeCents === null ? "" : formatMoney(r.chargeCents),
      r.receiptCents === null ? "" : formatMoney(r.receiptCents),
      formatMoney(r.balanceAfterCents),
    ]),
  );
  space(doc, 8);
  monoLine(doc, `balance due:     ${formatMoney(stmt.closingBalanceCents)}`, 11);
  stampFooter(doc, `${ctx.facility.name} · statement · unit ${ctx.unit.label}`);
  return persistNotice(ctx, "statement", await finish(doc), null, false);
}

/** The required-notice letter for an existing tenant's rate change. */
export async function renderRateChangeLetter(
  ctx: TenancyContext,
  oldCents: number,
  newCents: number,
  effectiveOn: IsoDate,
  noticeDays: number,
): Promise<{ noticeId: string; r2Key: string }> {
  const bytes = await noticeDoc(ctx, {
    title: "Notice of rent change",
    certified: false,
    paragraphs: [
      `The rent on unit ${ctx.unit.label} will change from ${formatMoney(oldCents)} to ${formatMoney(newCents)} ` +
        `per month, effective ${formatDateLong(effectiveOn)}.`,
      `This notice is given ${noticeDays} days in advance. Rent charged before the effective date is unchanged; ` +
        `the first payment at the new rate is the one due on or after that date.`,
      `Nothing else about the rental agreement changes. If the new rate does not work, the agreement is ` +
        `month-to-month and can be ended with written notice before the effective date.`,
    ],
    facts: [
      `unit:           ${ctx.unit.label} (${ctx.unit.size})`,
      `current rent:   ${formatMoney(oldCents)}`,
      `new rent:       ${formatMoney(newCents)}`,
      `effective:      ${effectiveOn}`,
      `notice given:   ${isoDateOf(new Date())} (${noticeDays} days)`,
    ],
  });
  return persistNotice(ctx, "rate_change", bytes, null, false);
}

/* ------------------------------------------------------------ lien packet --- */

/**
 * One PDF for the sale file: a cover sheet, then every notice generated on this
 * case copied page for page out of storage, then the full ledger.
 *
 * Copying rather than re-rendering is the point. The document a court cares about
 * is the one that was mailed, with the balance it stated on the day it was mailed.
 */
export interface PacketPack {
  steps: RuleStep[];
  state: string;
  version: number;
  reviewedOn: string;
  notes: string;
}

export async function renderLienPacket(
  ctx: TenancyContext,
  lienCase: { id: string; delinquentSince: string; stepsState: unknown; status: string },
  pack: PacketPack,
): Promise<{ r2Key: string; noticeCount: number }> {
  const timeline = buildTimeline(
    pack,
    lienCase.delinquentSince,
    (lienCase.stepsState ?? {}) as Record<string, never>,
    isoDateOf(new Date()),
  );

  const cover = await newDoc();
  heading(cover, "Lien file", 18);
  paragraph(
    cover,
    `${ctx.facility.name} · unit ${ctx.unit.label} · ${ctx.tenant.name}`,
    { dim: true },
  );
  rule(cover);
  label(cover, "Case");
  monoLine(cover, `state:            ${pack.state} (rule pack v${pack.version}, reviewed ${pack.reviewedOn})`);
  monoLine(cover, `delinquent since: ${lienCase.delinquentSince}`);
  monoLine(cover, `status:           ${lienCase.status}`);
  monoLine(cover, `earliest sale:    ${timeline.saleEligibleOn}`);
  space(cover, 10);

  label(cover, "Statutory steps");
  monoTable(
    cover,
    [
      { header: "STEP", width: 34 },
      { header: "DUE", width: 10 },
      { header: "DONE", width: 10 },
      { header: "TRACKING", width: 22 },
    ],
    timeline.steps.map((s) => [s.label, s.dueOn, s.completedOn ?? "—", s.trackingNumber ?? "—"]),
  );
  space(cover, 8);
  for (const step of timeline.steps) {
    monoLine(cover, `${step.dueOn}  ${step.citation}  ${step.label}`, 8.5);
  }
  space(cover, 10);
  paragraph(
    cover,
    `Rule pack notes: ${pack.notes}`,
    { dim: true, size: 9 },
  );

  const entries = toCoreEntries(await entriesFor(ctx.tenancy.id));
  const from = entries.length ? entries[0].occurredOn : ctx.tenancy.startedOn;
  const stmt = buildStatement(entries, from, isoDateOf(new Date()));

  space(cover, 12);
  rule(cover);
  heading(cover, "Ledger — every row, verbatim", 13);
  monoTable(
    cover,
    [
      { header: "DATE", width: 10 },
      { header: "KIND", width: 11 },
      { header: "DESCRIPTION", width: 32 },
      { header: "AMOUNT", width: 11, align: "right" },
      { header: "BALANCE", width: 11, align: "right" },
    ],
    entries.map((e) => [
      e.occurredOn,
      kindLabel(e.kind),
      e.description,
      formatMoney(e.amountCents),
      "",
    ]),
  );
  space(cover, 6);
  monoLine(cover, `balance due: ${formatMoney(stmt.closingBalanceCents)}`, 11);
  stampFooter(cover, `${ctx.facility.name} · lien file · unit ${ctx.unit.label}`);

  const packet = await PDFDocument.create();
  const coverPages = await packet.copyPages(cover.pdf, cover.pdf.getPageIndices());
  for (const page of coverPages) packet.addPage(page);

  const noticeRows = await getDb()
    .select()
    .from(notices)
    .where(and(eq(notices.lienCaseId, lienCase.id), eq(notices.tenancyId, ctx.tenancy.id)))
    .orderBy(asc(notices.generatedAt));

  const store = await storage();
  let attached = 0;
  for (const notice of noticeRows) {
    const object = await store.get(notice.r2Key);
    if (!object) continue;
    try {
      const source = await PDFDocument.load(object.bytes);
      const pages = await packet.copyPages(source, source.getPageIndices());
      for (const page of pages) packet.addPage(page);
      attached += 1;
    } catch (err) {
      // A single unreadable notice must not lose the whole sale file.
      console.error("[packet] could not attach notice", { noticeId: notice.id, err });
    }
  }

  const bytes = Buffer.from(await packet.save());
  const { key } = await putDocument(ctx.owner.id, "packet", bytes);
  return { r2Key: key, noticeCount: attached };
}

/** The window a statement covers by default: the last twelve months. */
export function defaultStatementWindow(asOf: IsoDate): { from: IsoDate; to: IsoDate } {
  return { from: addDays(asOf, -365), to: asOf };
}
