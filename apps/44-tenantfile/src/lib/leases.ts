/**
 * Lease e-sign.
 *
 * ARCHITECTURE.md calls for an embedded provider (Dropbox Sign-class). No such
 * credentials exist in this environment, and a lease that cannot be signed is a
 * tenancy that cannot start, so the `EsignProvider` interface below has a working
 * built-in adapter: each party opens their own signing link on their own phone,
 * reads the lease, types their full legal name, and confirms intent to sign
 * electronically. What is captured — typed name, timestamp, IP, user agent, and
 * the exact consent sentence — is the same evidence an e-sign provider's audit
 * certificate records, and it goes into the sealed PDF.
 *
 * That is not the same thing as a certified provider's tamper-evident seal, and
 * the UI says so rather than implying otherwise.
 *
 * Signing the last signature is the event that starts the money: the tenancy goes
 * active, the deposit and the (possibly prorated) first month are charged, the
 * reminder ladder is scheduled, and the File is stitched.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  leases,
  properties,
  tenancies,
  units,
  type Lease,
  type LeaseFields,
  type LeaseSignature,
  type LeaseSource,
  type Property,
  type SignerRole,
  type Tenancy,
  type Unit,
} from "@/db/schema";
import { stitch } from "@/lib/file-events";
import { ensureCharges, getLateFeeRule } from "@/lib/ledger";
import { describeLateFeeRule } from "@/lib/ledger-core";
import { newToken, signingUrl, tenantPortalUrl } from "@/lib/links";
import { emailShell, notifier } from "@/lib/notify";
import { formatDate, formatMoney, isoDateOf, type IsoDate } from "@/lib/money";
import { renderPdf, type PdfBlock } from "@/lib/pdf";
import { storeUpload } from "@/lib/storage";
import { audit } from "@/lib/audit";

export const CONSENT_SENTENCE =
  "I agree that typing my name here is my signature, that I intend to be bound by this lease, and that I have read it in full.";

export const ESIGN_HONESTY_NOTE =
  "TenantFile's built-in signing records each signer's typed name, the time, and their IP address, and seals them into the PDF. It is not a certified e-signature service; if your state or your lender requires one, sign there and upload the signed PDF here instead.";

/* ------------------------------------------------------------- the adapter --- */

export interface EsignEnvelope {
  envelopeId: string;
  landlordUrl: string;
  tenantUrl: string;
}

export interface EsignProvider {
  readonly name: string;
  createEnvelope(lease: Lease): Promise<EsignEnvelope>;
  signUrl(lease: Lease, role: SignerRole): string;
  voidEnvelope(lease: Lease, reason: string): Promise<void>;
}

class BuiltinEsign implements EsignProvider {
  readonly name = "builtin";

  async createEnvelope(lease: Lease): Promise<EsignEnvelope> {
    return {
      envelopeId: lease.id,
      landlordUrl: signingUrl(lease.landlordToken),
      tenantUrl: signingUrl(lease.tenantToken),
    };
  }

  signUrl(lease: Lease, role: SignerRole): string {
    return signingUrl(role === "landlord" ? lease.landlordToken : lease.tenantToken);
  }

  async voidEnvelope(): Promise<void> {
    /* Nothing to call: the built-in adapter's state is the lease row itself. */
  }
}

let _esign: EsignProvider | null = null;

export function esignProvider(): EsignProvider {
  if (!_esign) _esign = new BuiltinEsign();
  return _esign;
}

/* ------------------------------------------------------------- the drafting --- */

export interface DraftLeaseInput {
  source: LeaseSource;
  landlordName: string;
  /** Only for source = "upload". */
  upload?: { key: string; filename: string; sha256: string };
}

export async function draftLease(
  landlordId: string,
  tenancyId: string,
  input: DraftLeaseInput,
  actor: string,
): Promise<Lease> {
  const db = getDb();
  const owned = await tenancyWithUnit(landlordId, tenancyId);
  if (!owned) throw new Error("No such tenancy");
  if (owned.tenancy.status === "ended") throw new Error("That tenancy has ended");

  const existing = await db.select().from(leases).where(eq(leases.tenancyId, tenancyId));
  const live = existing.find((l) => l.status !== "voided");
  if (live && live.status === "signed") throw new Error("That lease is already signed");

  const rule = await getLateFeeRule(tenancyId);
  const fields: LeaseFields = {
    propertyAddress: [owned.property.address, owned.property.city, owned.property.state, owned.property.postalCode]
      .filter(Boolean)
      .join(", "),
    unitLabel: owned.unit.label,
    tenantNames: owned.tenancy.tenantNames,
    landlordName: input.landlordName,
    rentCents: owned.tenancy.rentCents,
    depositCents: owned.tenancy.depositCents,
    startsOn: owned.tenancy.startsOn as IsoDate,
    endsOn: (owned.tenancy.endsOn as IsoDate | null) ?? null,
    rentDueDay: owned.tenancy.rentDueDay,
    lateFeeSummary: rule
      ? describeLateFeeRule({
          graceDays: rule.graceDays,
          kind: rule.kind,
          amount: rule.amount,
          maxPerMonthCents: rule.maxPerMonthCents,
          enabled: rule.enabled,
        })
      : "No late fee",
    uploadKey: input.upload?.key,
    uploadFilename: input.upload?.filename,
    uploadSha256: input.upload?.sha256,
  };

  if (live) {
    const [updated] = await db
      .update(leases)
      .set({ source: input.source, fields, signatures: [], status: "draft", sentAt: null })
      .where(eq(leases.id, live.id))
      .returning();
    return updated;
  }

  const [lease] = await db
    .insert(leases)
    .values({
      tenancyId,
      source: input.source,
      provider: esignProvider().name,
      status: "draft",
      fields,
      landlordToken: newToken(),
      tenantToken: newToken(),
    })
    .returning();

  await db.update(leases).set({ providerEnvelopeId: lease.id }).where(eq(leases.id, lease.id));
  await audit(landlordId, actor, "lease.draft", lease.id, { source: input.source });
  return lease;
}

/** Send it out: both parties get their own link. */
export async function sendLease(landlordId: string, leaseId: string, actor: string): Promise<EsignEnvelope> {
  const db = getDb();
  const owned = await landlordLease(landlordId, leaseId);
  if (!owned) throw new Error("No such lease");
  if (owned.lease.status === "signed") throw new Error("That lease is already signed");

  const envelope = await esignProvider().createEnvelope(owned.lease);
  await db
    .update(leases)
    .set({ status: "sent", sentAt: new Date(), providerEnvelopeId: envelope.envelopeId })
    .where(eq(leases.id, leaseId));

  const tenantEmail = owned.tenancy.tenantEmails[0];
  if (tenantEmail) {
    const shell = emailShell(
      "Your lease is ready to sign",
      [
        `${owned.tenancy.tenantNames[0] ?? "Hello"} — the lease for ${owned.unit.label} at ${owned.property.address} is ready.`,
        `${formatMoney(owned.tenancy.rentCents)} a month, starting ${formatDate(owned.tenancy.startsOn as IsoDate, { year: true })}. Read it and sign on your phone; it takes two minutes.`,
      ],
      { label: "Read and sign the lease", url: envelope.tenantUrl },
    );
    await notifier().email({
      to: tenantEmail,
      subject: `Lease to sign — ${owned.unit.label}, ${owned.property.address}`,
      text: shell.text,
      html: shell.html,
    });
  }

  await stitch({
    tenancyId: owned.tenancy.id,
    kind: "lease",
    refId: leaseId,
    summary: "Lease sent for signature",
    detail: `${formatMoney(owned.tenancy.rentCents)}/month · ${owned.tenancy.tenantNames.join(", ")}`,
    dedupeKey: `lease-sent:${leaseId}`,
  });
  await audit(landlordId, actor, "lease.send", leaseId);
  return envelope;
}

export async function voidLease(landlordId: string, leaseId: string, reason: string, actor: string): Promise<void> {
  const db = getDb();
  const owned = await landlordLease(landlordId, leaseId);
  if (!owned) throw new Error("No such lease");
  await esignProvider().voidEnvelope(owned.lease, reason);
  await db.update(leases).set({ status: "voided", voidedAt: new Date() }).where(eq(leases.id, leaseId));
  await stitch({
    tenancyId: owned.tenancy.id,
    kind: "lease",
    refId: leaseId,
    summary: "Lease voided",
    detail: reason,
  });
  await audit(landlordId, actor, "lease.void", leaseId, { reason });
}

/* -------------------------------------------------------------- the signing --- */

export interface SigningView {
  lease: Lease;
  tenancy: Tenancy;
  unit: Unit;
  property: Property;
  role: SignerRole;
  alreadySigned: boolean;
  body: string[];
}

export async function leaseByToken(token: string): Promise<SigningView | null> {
  const db = getDb();
  const [row] = await db
    .select({ lease: leases, tenancy: tenancies, unit: units, property: properties })
    .from(leases)
    .innerJoin(tenancies, eq(tenancies.id, leases.tenancyId))
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(leases.landlordToken, token));

  const [row2] = row
    ? []
    : await db
        .select({ lease: leases, tenancy: tenancies, unit: units, property: properties })
        .from(leases)
        .innerJoin(tenancies, eq(tenancies.id, leases.tenancyId))
        .innerJoin(units, eq(units.id, tenancies.unitId))
        .innerJoin(properties, eq(properties.id, units.propertyId))
        .where(eq(leases.tenantToken, token));

  const found = row ?? row2;
  if (!found) return null;
  const role: SignerRole = row ? "landlord" : "tenant";

  return {
    ...found,
    role,
    alreadySigned: found.lease.signatures.some((s) => s.role === role),
    body: leaseBody(found.lease.fields, found.lease.source),
  };
}

/**
 * The lease text. This is a **template shell**, not a state-specific lease: it
 * states the terms TenantFile actually knows and then says plainly that anything
 * a particular state requires has to be added. Shipping a "Texas lease" the
 * product cannot stand behind would be worse than shipping an honest shell.
 */
export function leaseBody(fields: LeaseFields, source: LeaseSource): string[] {
  if (source === "upload") {
    return [
      `This signature page belongs to the lease document attached by the landlord${fields.uploadFilename ? ` (${fields.uploadFilename})` : ""}. Read that document before signing.`,
      `The terms recorded in TenantFile for this tenancy are: ${fields.unitLabel} at ${fields.propertyAddress}; rent ${formatMoney(fields.rentCents)} per month due on day ${fields.rentDueDay}; security deposit ${formatMoney(fields.depositCents)}; term from ${fields.startsOn} to ${fields.endsOn ?? "month to month"}. Late fee: ${fields.lateFeeSummary}.`,
      `If the attached document says something different from the above, the attached document is the lease.`,
    ];
  }

  return [
    `1. Parties. This lease is between ${fields.landlordName} ("the landlord") and ${fields.tenantNames.join(", ") || "the tenant"} ("the tenant").`,
    `2. Premises. The landlord lets to the tenant ${fields.unitLabel} at ${fields.propertyAddress}.`,
    `3. Term. The tenancy begins on ${fields.startsOn} and ${fields.endsOn ? `ends on ${fields.endsOn}` : "continues month to month until either party ends it with proper notice"}.`,
    `4. Rent. ${formatMoney(fields.rentCents)} per month, due on day ${fields.rentDueDay} of each month. The first month may be prorated if the tenancy does not begin on the due day; the exact amount appears on the tenant's rent page.`,
    `5. Late payment. ${fields.lateFeeSummary}.`,
    `6. Security deposit. ${formatMoney(fields.depositCents)}, held by the landlord and returned after the tenancy ends, less any lawful deductions, within the period your state requires.`,
    `7. Utilities and services. As agreed in writing between the parties. Anything not listed here is the tenant's responsibility.`,
    `8. Condition and repairs. The tenant will tell the landlord promptly about anything that needs repair, through the maintenance page on their rent link, so both sides have the record. The landlord will keep the premises fit to live in as the law requires.`,
    `9. Access. The landlord may enter with reasonable notice, except in an emergency.`,
    `10. State-specific terms. This shell does not contain the disclosures and clauses your state requires (lead paint, deposit handling, notice periods, and others). Add them in writing before signing, or upload your own lease instead. TenantFile is not your lawyer.`,
  ];
}

export interface SignInput {
  token: string;
  typedName: string;
  ip: string;
  userAgent: string;
}

export interface SignResult {
  ok: boolean;
  error?: string;
  fullySigned?: boolean;
  tenancyId?: string;
}

/**
 * Record one signature. When it is the last one, activate the tenancy: seal the
 * PDF, generate the deposit and first charges, schedule reminders, and stitch the
 * File. Idempotent per signer — a double-tap does not sign twice.
 */
export async function signLease(input: SignInput): Promise<SignResult> {
  const view = await leaseByToken(input.token);
  if (!view) return { ok: false, error: "That signing link is not valid" };
  if (view.lease.status === "voided") return { ok: false, error: "That lease was voided" };

  const expectedNames =
    view.role === "landlord" ? [view.lease.fields.landlordName] : view.lease.fields.tenantNames;
  const typed = input.typedName.trim();
  if (typed.length < 3) return { ok: false, error: "Type your full legal name" };
  if (
    expectedNames.length > 0 &&
    !expectedNames.some((n) => n.trim().toLowerCase() === typed.toLowerCase())
  ) {
    return {
      ok: false,
      error: `Type your name exactly as it appears on the lease: ${expectedNames.join(" or ")}`,
    };
  }

  const db = getDb();
  if (view.alreadySigned) {
    return { ok: true, fullySigned: view.lease.status === "signed", tenancyId: view.tenancy.id };
  }

  const signature: LeaseSignature = {
    role: view.role,
    name: expectedNames[0] ?? typed,
    typedName: typed,
    email: view.role === "landlord" ? "" : (view.tenancy.tenantEmails[0] ?? ""),
    signedAt: new Date().toISOString(),
    ip: input.ip,
    userAgent: input.userAgent.slice(0, 200),
    consent: CONSENT_SENTENCE,
  };

  const signatures = [...view.lease.signatures, signature];
  const fullySigned = signatures.some((s) => s.role === "landlord") && signatures.some((s) => s.role === "tenant");

  await db
    .update(leases)
    .set({
      signatures,
      status: fullySigned ? "signed" : "partially_signed",
      signedAt: fullySigned ? new Date() : null,
    })
    .where(eq(leases.id, view.lease.id));

  await stitch({
    tenancyId: view.tenancy.id,
    kind: "lease",
    refId: view.lease.id,
    summary: `Lease signed by the ${view.role}`,
    detail: `"${typed}" from ${input.ip}`,
    dedupeKey: `lease-signed-${view.role}:${view.lease.id}`,
  });

  if (fullySigned) await onFullySigned(view.lease.id);
  return { ok: true, fullySigned, tenancyId: view.tenancy.id };
}

/**
 * Everything that happens the moment a lease is fully signed. Written to be safe
 * to call twice: the PDF is only sealed once, charge generation is idempotent, and
 * every File event carries a dedupe key.
 */
export async function onFullySigned(leaseId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ lease: leases, tenancy: tenancies, unit: units, property: properties })
    .from(leases)
    .innerJoin(tenancies, eq(tenancies.id, leases.tenancyId))
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(leases.id, leaseId));
  if (!row) return;

  // 1. Seal the PDF.
  if (!row.lease.signedPdfKey) {
    const bytes = renderPdf(sealedLeaseDocument(row.lease, row.unit.label));
    const put = await storeUpload(row.property.landlordId, "lease", {
      bytes,
      contentType: "application/pdf",
    });
    await db.update(leases).set({ signedPdfKey: put.key }).where(eq(leases.id, leaseId));
  }

  // 2. Activate the tenancy and occupy the unit.
  const [tenancy] = await db
    .update(tenancies)
    .set({ status: "active", activatedAt: row.tenancy.activatedAt ?? new Date() })
    .where(eq(tenancies.id, row.tenancy.id))
    .returning();
  await db.update(units).set({ status: "occupied" }).where(eq(units.id, row.unit.id));

  await stitch({
    tenancyId: tenancy.id,
    kind: "lease",
    refId: leaseId,
    summary: "Lease fully signed · tenancy active",
    detail: `${formatMoney(tenancy.rentCents)}/month from ${tenancy.startsOn}`,
    dedupeKey: `lease-complete:${leaseId}`,
  });

  // 3. First charges (deposit + possibly prorated first month) and reminders.
  await ensureCharges(tenancy);

  // 4. Tell the tenant where their rent page is.
  const tenantEmail = tenancy.tenantEmails[0];
  if (tenantEmail) {
    const shell = emailShell(
      "Your lease is signed",
      [
        `Everything is signed for ${row.unit.label} at ${row.property.address}.`,
        "Your rent page below shows what is due and when, every payment recorded, and it is where you report anything that needs fixing. Bookmark it — there is no app to download.",
      ],
      { label: "Open your rent page", url: tenantPortalUrl(tenancy.portalToken) },
    );
    await notifier().email({
      to: tenantEmail,
      subject: `Signed — ${row.unit.label}, ${row.property.address}`,
      text: shell.text,
      html: shell.html,
    });
  }
}

/** The sealed document: the lease text, then the signature audit certificate. */
export function sealedLeaseDocument(lease: Lease, unitLabel: string) {
  const f = lease.fields;
  const blocks: PdfBlock[] = [];

  blocks.push({ type: "label", text: "Residential lease" });
  blocks.push({ type: "row", left: f.propertyAddress, right: unitLabel, strong: true });
  blocks.push({ type: "space", height: 8 });
  for (const clause of leaseBody(f, lease.source)) blocks.push({ type: "body", text: clause });

  blocks.push({ type: "pagebreak" });
  blocks.push({ type: "title", text: "Signature certificate" });
  blocks.push({
    type: "body",
    text: "Each signer below opened their own signing link, read the lease, and typed their name to sign it. The consent sentence each of them agreed to is reproduced under their signature.",
  });
  blocks.push({ type: "rule" });

  for (const sig of lease.signatures) {
    blocks.push({ type: "heading", text: sig.role === "landlord" ? "Landlord" : "Tenant" });
    blocks.push({ type: "row", left: "Signed as", right: sig.typedName, strong: true });
    blocks.push({ type: "row", left: "Time (UTC)", right: sig.signedAt });
    blocks.push({ type: "row", left: "IP address", right: sig.ip || "not recorded" });
    if (sig.email) blocks.push({ type: "row", left: "Email", right: sig.email });
    blocks.push({ type: "mono", text: sig.userAgent || "user agent not recorded" });
    blocks.push({ type: "body", text: `"${sig.consent}"` });
    blocks.push({ type: "rule" });
  }

  if (f.uploadSha256) {
    blocks.push({ type: "heading", text: "Attached lease document" });
    blocks.push({ type: "row", left: f.uploadFilename ?? "lease.pdf", right: "SHA-256" });
    blocks.push({ type: "mono", text: f.uploadSha256 });
    blocks.push({
      type: "body",
      text: "The signatures above apply to the document with this checksum. If the file changes, the checksum will not match.",
    });
  }

  blocks.push({ type: "body", text: ESIGN_HONESTY_NOTE });

  return {
    title: `Lease — ${f.propertyAddress}, ${unitLabel}`,
    subtitle: `${f.tenantNames.join(", ")} · ${f.startsOn} to ${f.endsOn ?? "month to month"} · ${formatMoney(f.rentCents)}/month`,
    footer: `Sealed by TenantFile ${isoDateOf(new Date())}`,
    blocks,
  };
}

/* ------------------------------------------------------------------ reads --- */

export interface OwnedLease {
  lease: Lease;
  tenancy: Tenancy;
  unit: Unit;
  property: Property;
}

export async function landlordLease(landlordId: string, leaseId: string): Promise<OwnedLease | null> {
  const db = getDb();
  const [row] = await db
    .select({ lease: leases, tenancy: tenancies, unit: units, property: properties })
    .from(leases)
    .innerJoin(tenancies, eq(tenancies.id, leases.tenancyId))
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(eq(leases.id, leaseId), eq(properties.landlordId, landlordId)));
  return row ?? null;
}

export async function leaseForTenancy(tenancyId: string): Promise<Lease | null> {
  const rows = await getDb().select().from(leases).where(eq(leases.tenancyId, tenancyId));
  return rows.find((l) => l.status !== "voided") ?? rows[0] ?? null;
}

async function tenancyWithUnit(landlordId: string, tenancyId: string) {
  const db = getDb();
  const [row] = await db
    .select({ tenancy: tenancies, unit: units, property: properties })
    .from(tenancies)
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(eq(tenancies.id, tenancyId), eq(properties.landlordId, landlordId)));
  return row ?? null;
}

export function leaseStatusLabel(status: Lease["status"]): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Awaiting signature";
    case "partially_signed":
      return "One signature in";
    case "signed":
      return "Signed";
    case "voided":
      return "Voided";
  }
}
