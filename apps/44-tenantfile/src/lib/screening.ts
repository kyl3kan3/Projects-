/**
 * Screening — intake and record-keeping only.
 *
 * ## What this module deliberately does NOT do
 *
 * No consumer reporting agency is integrated, and none should be wired in behind
 * this interface without a lawyer in the room. Tenant screening sits inside the
 * Fair Credit Reporting Act: pulling a report requires a permissible purpose, a
 * standalone written disclosure, the applicant's authorisation, certifications to
 * the agency, and adverse-action duties on the way out. Fair-housing law then
 * governs what may be *used*. A product that scores an applicant, ranks
 * applicants, or recommends a decision is doing something with real legal weight,
 * and TenantFile does none of it:
 *
 *   - It never fetches, stores, or parses report contents.
 *   - It computes no score, no risk band, no "clear/flagged" state. The
 *     `ScreeningStatus` enum has no such value on purpose.
 *   - It makes no recommendation. The landlord decides; TenantFile records that
 *     they decided and when.
 *
 * ## What it does do, and why that is still worth having
 *
 *   1. **Consent, captured properly.** The applicant reads a plain-language
 *      disclosure on their own page and authorises the check by typing their
 *      name. Timestamp, IP and typed name are stored — the evidence a landlord
 *      needs to show that authorisation existed.
 *   2. **A record of the request and its outcome.** Which agency, which
 *      reference number, when the report was received, when it expires.
 *   3. **The paper trail into the File**, so a decline six months later still has
 *      its adverse-action notice attached to the tenancy.
 *
 * ## The interface, for whoever does the integration
 *
 * `ScreeningProvider` is the seam a SmartMove-class API would slot into. The
 * shipped implementation is `manual`: it invites the applicant, captures consent,
 * and then waits for the landlord to record what the agency sent them directly.
 * Every provider-specific concern stays behind this interface.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  applications,
  properties,
  screeningReports,
  units,
  listings,
  type Application,
  type ScreeningReport,
} from "@/db/schema";
import { newToken, screeningInviteUrl } from "@/lib/links";
import { emailShell, notifier } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { addDays, isoDateOf, type IsoDate } from "@/lib/money";
import { assertTransition } from "@/lib/application-pipeline";

export interface ScreeningInvite {
  /** Where the applicant goes to read the disclosure and authorise. */
  url: string;
  reportId: string;
}

/**
 * The seam a real provider would implement. `invite` is the only method with a
 * working implementation today; a provider integration would additionally poll or
 * receive a webhook, and would still never hand this app report contents.
 */
export interface ScreeningProvider {
  readonly name: string;
  /** Start a check. Returns where to send the applicant. */
  invite(input: { report: ScreeningReport; application: Application }): Promise<ScreeningInvite>;
}

/**
 * The shipped provider: applicant-initiated consent, then the landlord orders and
 * pays for (or has the applicant pay for) the report with the agency of their
 * choice and records the result here. Honest about being a filing cabinet.
 */
class ManualScreening implements ScreeningProvider {
  readonly name = "manual";

  async invite({ report }: { report: ScreeningReport; application: Application }): Promise<ScreeningInvite> {
    return { url: screeningInviteUrl(report.inviteToken), reportId: report.id };
  }
}

let _provider: ScreeningProvider | null = null;

export function screeningProvider(): ScreeningProvider {
  if (!_provider) _provider = new ManualScreening();
  return _provider;
}

/** Disclosure text shown to the applicant. Plain language, no fine print games. */
export const SCREENING_DISCLOSURE = [
  "Your landlord would like to run a tenant screening check on you. That usually means a credit report, an eviction-record search, and a criminal-record search, ordered from a consumer reporting agency.",
  "By typing your full name below you authorise them to obtain those reports about you in connection with your rental application. Nothing is ordered until you do.",
  "TenantFile does not run the check, does not receive the reports, and does not score you. It records that you authorised the check, and the date. If your landlord decides not to rent to you because of something in a report, they must tell you which agency supplied it, and you can get a free copy from that agency and dispute anything that is wrong.",
] as const;

export const SCREENING_FEE_NOTE =
  "Screening reports normally cost the applicant around $35–45, paid directly to the agency. TenantFile does not take a payment for this.";

/* ------------------------------------------------------------------ flows --- */

/** Invite an applicant to authorise a screening check. */
export async function inviteToScreen(
  landlordId: string,
  applicationId: string,
  actor: string,
): Promise<ScreeningInvite> {
  const db = getDb();
  const [row] = await db
    .select({ application: applications, unit: units, property: properties })
    .from(applications)
    .innerJoin(listings, eq(listings.id, applications.listingId))
    .innerJoin(units, eq(units.id, listings.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(eq(applications.id, applicationId), eq(properties.landlordId, landlordId)));
  if (!row) throw new Error("No such application");

  const existing = await db
    .select()
    .from(screeningReports)
    .where(eq(screeningReports.applicationId, applicationId));

  let report = existing.find((r) => r.status !== "canceled" && r.status !== "expired");
  if (!report) {
    if (row.application.status === "new") assertTransition(row.application.status, "invited_to_screen");
    const [created] = await db
      .insert(screeningReports)
      .values({ applicationId, status: "invited", inviteToken: newToken() })
      .returning();
    report = created;
  }

  if (row.application.status === "new") {
    await db.update(applications).set({ status: "invited_to_screen" }).where(eq(applications.id, applicationId));
  }

  const invite = await screeningProvider().invite({ report, application: row.application });

  const shell = emailShell(
    "Authorise your tenant screening check",
    [
      `${row.application.applicantName} — for your application on ${row.unit.label} at ${row.property.address}, the next step is a screening check.`,
      "Read the disclosure and authorise it on the page below. It takes a minute.",
      SCREENING_FEE_NOTE,
    ],
    { label: "Read and authorise", url: invite.url },
  );
  await notifier().email({
    to: row.application.applicantEmail,
    subject: `Screening authorisation for ${row.unit.label}, ${row.property.address}`,
    text: shell.text,
    html: shell.html,
  });

  await audit(landlordId, actor, "screening.invite", applicationId, { reportId: report.id });
  return invite;
}

export async function screeningByToken(token: string) {
  const db = getDb();
  const [row] = await db
    .select({
      report: screeningReports,
      application: applications,
      unit: units,
      property: properties,
    })
    .from(screeningReports)
    .innerJoin(applications, eq(applications.id, screeningReports.applicationId))
    .innerJoin(listings, eq(listings.id, applications.listingId))
    .innerJoin(units, eq(units.id, listings.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(screeningReports.inviteToken, token));
  return row ?? null;
}

/** The applicant authorises. This is the only write the applicant can make here. */
export async function recordConsent(
  token: string,
  typedName: string,
  ip: string,
): Promise<{ ok: boolean; error?: string }> {
  const row = await screeningByToken(token);
  if (!row) return { ok: false, error: "That link is not valid" };
  if (row.report.status !== "invited" && row.report.status !== "consented") {
    return { ok: false, error: "This authorisation has already been dealt with" };
  }
  const expected = row.application.applicantName.trim().toLowerCase();
  if (typedName.trim().toLowerCase() !== expected) {
    return { ok: false, error: `Type your name exactly as it is on the application: ${row.application.applicantName}` };
  }

  await getDb()
    .update(screeningReports)
    .set({
      status: "awaiting_provider",
      consentAt: new Date(),
      consentIp: ip,
      consentName: typedName.trim(),
    })
    .where(eq(screeningReports.id, row.report.id));

  return { ok: true };
}

export interface RecordReportInput {
  provider: string;
  providerRef: string;
  receivedOn: IsoDate;
  landlordNote: string;
  paidByApplicant: boolean;
}

/**
 * The landlord records that a report arrived. Note the shape of the input: an
 * agency name, a reference, a date, and the landlord's own note. No score field
 * exists to fill in, because TenantFile will not hold one.
 */
export async function recordReportReceived(
  landlordId: string,
  applicationId: string,
  actor: string,
  input: RecordReportInput,
): Promise<void> {
  const db = getDb();
  const [report] = await db
    .select()
    .from(screeningReports)
    .where(eq(screeningReports.applicationId, applicationId));
  if (!report) throw new Error("No screening record for that application");

  await db
    .update(screeningReports)
    .set({
      provider: input.provider,
      providerRef: input.providerRef,
      status: "received",
      receivedOn: input.receivedOn,
      // Reports go stale; providers typically treat them as good for 30 days.
      expiresOn: addDays(input.receivedOn, 30),
      landlordNote: input.landlordNote,
      paidByApplicant: input.paidByApplicant,
    })
    .where(eq(screeningReports.id, report.id));

  const [application] = await db.select().from(applications).where(eq(applications.id, applicationId));
  if (application && application.status === "invited_to_screen") {
    await db.update(applications).set({ status: "screened" }).where(eq(applications.id, applicationId));
  }

  await audit(landlordId, actor, "screening.record", applicationId, {
    provider: input.provider,
    providerRef: input.providerRef,
  });
}

export function screeningStatusLabel(report: ScreeningReport | null): string {
  if (!report) return "Not screened";
  switch (report.status) {
    case "invited":
      return "Authorisation sent";
    case "consented":
      return "Applicant authorised";
    case "awaiting_provider":
      return "Authorised · awaiting report";
    case "received":
      return "Report on file";
    case "expired":
      return "Report expired";
    case "canceled":
      return "Canceled";
  }
}

/** Has this report gone stale? Expiry is a fact about the date, not a judgement. */
export function screeningExpired(report: ScreeningReport | null, today = isoDateOf(new Date())): boolean {
  return report?.expiresOn != null && (report.expiresOn as string) < today;
}
