/**
 * Application intake and the pipeline.
 *
 * The form is deliberately narrow: contact details, where they live now, work and
 * stated income, occupants, pets, vehicles, a previous-landlord reference, and a
 * free-text note. Nothing about protected characteristics — see
 * application-pipeline.ts, which holds that list and the reasoning.
 *
 * Approving an application seeds a **draft** tenancy rather than an active one.
 * Nothing starts a rent ledger except a signed lease (or an explicit
 * import-existing-tenancy), because a ledger that starts before the tenancy is a
 * ledger the landlord has to correct by hand.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  applications,
  listings,
  properties,
  screeningReports,
  tenancies,
  units,
  type Application,
  type ApplicationAnswers,
  type Listing,
  type Property,
  type Tenancy,
  type Unit,
} from "@/db/schema";
import {
  adverseActionLetter,
  assertTransition,
  requiresAdverseAction,
  statusLabel,
  type AdverseActionInput,
} from "@/lib/application-pipeline";
import { stitch } from "@/lib/file-events";
import { emailShell, notifier } from "@/lib/notify";
import { newToken, tenantPortalUrl } from "@/lib/links";
import { audit } from "@/lib/audit";
import { formatMoney, isoDateOf, parseMoneyToCents, type IsoDate } from "@/lib/money";
import { addMonths } from "date-fns";

export const applicationInput = z.object({
  applicantName: z.string().trim().min(2, "Enter your full name").max(120),
  applicantEmail: z.string().trim().email("Enter an email address that works"),
  applicantPhone: z.string().trim().min(7, "Enter a phone number").max(32),
  currentAddress: z.string().trim().min(5, "Where do you live now?").max(200),
  moveInOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date you would like to move in"),
  occupants: z.coerce.number().int().min(1).max(12),
  employer: z.string().trim().max(120).default(""),
  jobTitle: z.string().trim().max(120).default(""),
  monthlyIncome: z.string().trim().default("0"),
  employmentYears: z.coerce.number().min(0).max(60).default(0),
  previousLandlordName: z.string().trim().max(120).default(""),
  previousLandlordPhone: z.string().trim().max(32).default(""),
  pets: z.string().trim().max(200).default(""),
  vehicles: z.string().trim().max(200).default(""),
  smoker: z.coerce.boolean().default(false),
  notes: z.string().trim().max(2000).default(""),
});

export type ApplicationInput = z.infer<typeof applicationInput>;

export async function submitApplication(
  slug: string,
  input: ApplicationInput,
  documentKeys: string[],
): Promise<Application> {
  const db = getDb();
  const [row] = await db
    .select({ listing: listings, unit: units, property: properties })
    .from(listings)
    .innerJoin(units, eq(units.id, listings.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(listings.slug, slug));
  if (!row) throw new Error("That listing is no longer available");
  if (row.listing.status !== "live") throw new Error("That listing has closed — the unit is no longer taking applications");

  let monthlyIncomeCents = 0;
  try {
    monthlyIncomeCents = Math.max(0, parseMoneyToCents(input.monthlyIncome || "0"));
  } catch {
    throw new Error("Enter your monthly income as a number, like 5400");
  }

  const answers: ApplicationAnswers = {
    currentAddress: input.currentAddress,
    moveInOn: input.moveInOn,
    occupants: input.occupants,
    employer: input.employer,
    jobTitle: input.jobTitle,
    monthlyIncomeCents,
    employmentYears: input.employmentYears,
    previousLandlordName: input.previousLandlordName,
    previousLandlordPhone: input.previousLandlordPhone,
    pets: input.pets,
    vehicles: input.vehicles,
    smoker: input.smoker,
    notes: input.notes,
  };

  const [application] = await db
    .insert(applications)
    .values({
      listingId: row.listing.id,
      applicantName: input.applicantName,
      applicantEmail: input.applicantEmail.toLowerCase(),
      applicantPhone: input.applicantPhone,
      answers,
      documentKeys,
      status: "new",
    })
    .returning();

  // Tell the landlord. A vacancy is the burning task they signed up for.
  const [owner] = await db.execute<{ email: string; name: string | null }>(sql`
    select u.email, u.name
    from users u
    where u.landlord_id = ${row.property.landlordId}
    order by u.created_at asc
    limit 1
  `);
  if (owner?.email) {
    const shell = emailShell(
      `New application for ${row.property.address} ${row.unit.label}`,
      [
        `${input.applicantName} applied for ${row.unit.label} at ${row.property.address}.`,
        `Stated income ${formatMoney(monthlyIncomeCents)}/month against rent of ${formatMoney(row.unit.rentCents)}. Wants to move in ${input.moveInOn}. ${input.occupants} occupant${input.occupants === 1 ? "" : "s"}.`,
        documentKeys.length ? `${documentKeys.length} document${documentKeys.length === 1 ? "" : "s"} attached.` : "No documents attached.",
      ],
      { label: "Review the application", url: `${process.env.APP_URL ?? "http://localhost:3044"}/applications/${application.id}` },
    );
    await notifier().email({
      to: owner.email,
      subject: `New application — ${row.unit.label}, ${row.property.address}`,
      text: shell.text,
      html: shell.html,
    });
  }

  return application;
}

/* ----------------------------------------------------------------- reads --- */

export interface OwnedApplication {
  application: Application;
  listing: Listing;
  unit: Unit;
  property: Property;
}

export async function landlordApplication(landlordId: string, applicationId: string): Promise<OwnedApplication | null> {
  const db = getDb();
  const [row] = await db
    .select({ application: applications, listing: listings, unit: units, property: properties })
    .from(applications)
    .innerJoin(listings, eq(listings.id, applications.listingId))
    .innerJoin(units, eq(units.id, listings.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(eq(applications.id, applicationId), eq(properties.landlordId, landlordId)));
  return row ?? null;
}

export async function applicationsForListing(listingId: string): Promise<Application[]> {
  return getDb()
    .select()
    .from(applications)
    .where(eq(applications.listingId, listingId))
    .orderBy(desc(applications.submittedAt));
}

export async function landlordPipeline(landlordId: string) {
  const db = getDb();
  return db
    .select({ application: applications, listing: listings, unit: units, property: properties })
    .from(applications)
    .innerJoin(listings, eq(listings.id, applications.listingId))
    .innerJoin(units, eq(units.id, listings.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(properties.landlordId, landlordId))
    .orderBy(desc(applications.submittedAt));
}

export async function screeningFor(applicationId: string) {
  const [row] = await getDb()
    .select()
    .from(screeningReports)
    .where(eq(screeningReports.applicationId, applicationId))
    .orderBy(asc(screeningReports.createdAt));
  return row ?? null;
}

/* ----------------------------------------------------------- transitions --- */

/**
 * Approve: seeds a DRAFT tenancy from the application and the unit. The lease
 * signing (or an explicit import) is what makes it active and starts the ledger.
 */
export async function approveApplication(
  landlordId: string,
  applicationId: string,
  actor: string,
): Promise<Tenancy> {
  const db = getDb();
  const owned = await landlordApplication(landlordId, applicationId);
  if (!owned) throw new Error("No such application");
  assertTransition(owned.application.status, "approved");

  const existing = await db.select().from(tenancies).where(eq(tenancies.applicationId, applicationId));
  if (existing[0]) return existing[0];

  const startsOn = (owned.application.answers.moveInOn as IsoDate) || isoDateOf(new Date());
  const months = owned.listing.requirements.leaseMonths || 12;
  const endsOn = isoDateOf(new Date(addMonths(new Date(`${startsOn}T00:00:00Z`), months).getTime() - 86_400_000));

  const [tenancy] = await db
    .insert(tenancies)
    .values({
      unitId: owned.unit.id,
      applicationId,
      tenantNames: [owned.application.applicantName],
      tenantEmails: [owned.application.applicantEmail],
      tenantPhones: owned.application.applicantPhone ? [owned.application.applicantPhone] : [],
      startsOn,
      endsOn,
      rentCents: owned.unit.rentCents,
      depositCents: owned.listing.requirements.depositCents || owned.unit.depositCents,
      rentDueDay: 1,
      status: "draft",
      portalToken: newToken(),
    })
    .returning();

  await db.update(applications).set({ status: "approved" }).where(eq(applications.id, applicationId));

  await stitch({
    tenancyId: tenancy.id,
    kind: "application",
    refId: applicationId,
    occurredAt: owned.application.submittedAt,
    summary: `${owned.application.applicantName} applied for ${owned.unit.label}`,
    detail: `Stated income ${formatMoney(owned.application.answers.monthlyIncomeCents)}/month · ${owned.application.documentKeys.length} document${owned.application.documentKeys.length === 1 ? "" : "s"} attached`,
    dedupeKey: `application:${applicationId}`,
  });
  await stitch({
    tenancyId: tenancy.id,
    kind: "application",
    refId: applicationId,
    summary: "Application approved · tenancy drafted",
    dedupeKey: `application-approved:${applicationId}`,
  });

  await notifier().email({
    to: owned.application.applicantEmail,
    subject: `Good news about ${owned.property.address} ${owned.unit.label}`,
    ...emailShell(
      "Your application was approved",
      [
        `${owned.application.applicantName} — I would like to go ahead with you for ${owned.unit.label} at ${owned.property.address}.`,
        "I will send the lease to sign next. Nothing is owed until that is signed.",
      ],
      { label: "Your tenancy page", url: tenantPortalUrl(tenancy.portalToken) },
    ),
  });

  await audit(landlordId, actor, "application.approve", applicationId, { tenancyId: tenancy.id });
  return tenancy;
}

export interface DeclineInput {
  reason: string;
  reportUsed: boolean;
  agencyName?: string;
  agencyAddress?: string;
  agencyPhone?: string;
  landlordContact?: string;
  /** The landlord edited the letter; send exactly this. */
  letterOverride?: string;
}

/**
 * Decline. When a screening record exists — or the applicant was ever invited to
 * screen — the adverse-action letter is not optional: this function refuses to
 * complete without one, and records when it was sent.
 */
export async function declineApplication(
  landlordId: string,
  applicationId: string,
  actor: string,
  input: DeclineInput,
): Promise<{ letter: string }> {
  const db = getDb();
  const owned = await landlordApplication(landlordId, applicationId);
  if (!owned) throw new Error("No such application");
  assertTransition(owned.application.status, "declined");

  const screening = await screeningFor(applicationId);
  const needsLetter = requiresAdverseAction(owned.application.status, screening != null);

  if (needsLetter && !input.reason.trim()) {
    throw new Error("Adverse-action notice needs a reason in your own words before it can go out");
  }
  if (needsLetter && input.reportUsed && !input.agencyName?.trim()) {
    throw new Error("Name the screening company that supplied the report — the notice is not valid without it");
  }

  const letterInput: AdverseActionInput = {
    applicantName: owned.application.applicantName,
    propertyLine: `${owned.unit.label} at ${owned.property.address}`,
    landlordName: actor,
    landlordContact: input.landlordContact ?? "",
    reason: input.reason,
    agencyName: input.agencyName,
    agencyAddress: input.agencyAddress,
    agencyPhone: input.agencyPhone,
    reportUsed: input.reportUsed,
    dateLine: isoDateOf(new Date()),
  };
  const letter = input.letterOverride?.trim() || adverseActionLetter(letterInput);

  await db
    .update(applications)
    .set({
      status: "declined",
      declineReason: input.reason,
      adverseActionSentAt: needsLetter ? new Date() : null,
      adverseActionBody: needsLetter ? letter : null,
    })
    .where(eq(applications.id, applicationId));

  if (needsLetter) {
    await notifier().email({
      to: owned.application.applicantEmail,
      subject: `About your application for ${owned.unit.label}, ${owned.property.address}`,
      text: letter,
    });
  }

  await audit(landlordId, actor, "application.decline", applicationId, {
    adverseActionSent: needsLetter,
    reportUsed: input.reportUsed,
  });

  return { letter };
}

/** Draft the letter for the decline sheet, without sending anything. */
export function draftAdverseAction(
  owned: OwnedApplication,
  landlordName: string,
  input: Pick<DeclineInput, "reason" | "reportUsed" | "agencyName" | "agencyAddress" | "agencyPhone" | "landlordContact">,
): string {
  return adverseActionLetter({
    applicantName: owned.application.applicantName,
    propertyLine: `${owned.unit.label} at ${owned.property.address}`,
    landlordName,
    landlordContact: input.landlordContact ?? "",
    reason: input.reason,
    agencyName: input.agencyName,
    agencyAddress: input.agencyAddress,
    agencyPhone: input.agencyPhone,
    reportUsed: input.reportUsed,
    dateLine: isoDateOf(new Date()),
  });
}

export { statusLabel };
