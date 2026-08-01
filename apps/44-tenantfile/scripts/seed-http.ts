/**
 * Throwaway: seeds one landlord, listing, application, screening invite, sent
 * lease and active tenancy, then writes the tokens to /tmp/tf-seed.env so
 * scripts/walkthrough.sh can hit the real HTTP routes.
 */

import "@/lib/load-env";
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { DEFAULT_SETTINGS, landlords, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { createProperty, createUnit, importTenancy } from "@/lib/units";
import { createListing } from "@/lib/listings";
import { submitApplication } from "@/lib/applications";
import { inviteToScreen } from "@/lib/screening";
import { draftLease, sendLease } from "@/lib/leases";
import { recordPayment, loadLedger, upsertLateFeeRule } from "@/lib/ledger";
import { openRequest } from "@/lib/maintenance";
import { setNotifier } from "@/lib/notify";
import { storeUpload } from "@/lib/storage";

const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDL/wAALCAAGAAgBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+v//Z",
  "base64",
);

async function main() {
  setNotifier({
    async email() {
      return { ok: true, simulated: true };
    },
    async sms() {
      return { ok: true, simulated: true };
    },
  });

  const db = getDb();
  const email = "walkthrough@tenantfile.test";

  // Idempotent: wipe any previous seed for this address.
  const existing = await db.select().from(users).where(eq(users.email, email));
  for (const u of existing) await db.delete(landlords).where(eq(landlords.id, u.landlordId));

  const [landlord] = await db
    .insert(landlords)
    .values({ name: "Alvarez Rentals", plan: "building", settings: DEFAULT_SETTINGS })
    .returning();
  await db.insert(users).values({
    landlordId: landlord.id,
    email,
    name: "Ray Doyle",
    passwordHash: await hashPassword("walkthrough-password"),
    role: "owner",
  });

  const property = await createProperty(
    landlord.id,
    { address: "114 Maple Street", city: "Dayton", state: "OH", postalCode: "45402", type: "multi" },
    "Ray Doyle",
  );

  // Unit 1A: vacant and listed, with an application and a screening invite.
  const vacant = await createUnit(
    landlord.id,
    landlord.plan,
    property.id,
    { label: "1A", beds: 2, baths: 1, sqft: 890, rent: "1850", deposit: "1850" },
    "Ray Doyle",
  );
  const photo = await storeUpload(landlord.id, "listing", { bytes: JPEG, contentType: "image/jpeg" });
  const listing = await createListing(
    landlord.id,
    vacant.id,
    {
      headline: "Bright 2-bed upstairs unit, porch, off-street parking",
      description:
        "Second floor of a well-kept 1920s duplex. New windows last spring, gas heat, washer-dryer in the basement shared with one other unit.",
      minIncomeMultiple: 3,
      depositCents: 185_000,
      petsAllowed: true,
      smokingAllowed: false,
      availableOn: "2026-09-01",
      leaseMonths: 12,
    },
    [photo.key],
    "Ray Doyle",
  );

  const doc = await storeUpload(landlord.id, "application", { bytes: JPEG, contentType: "image/jpeg" });
  const application = await submitApplication(
    listing.slug,
    {
      applicantName: "Owen Pratt",
      applicantEmail: "owen@example.com",
      applicantPhone: "+19375550199",
      currentAddress: "12 Ridge Road, Dayton OH",
      moveInOn: "2026-09-01",
      occupants: 1,
      employer: "Dayton Bicycle Works",
      jobTitle: "Mechanic",
      monthlyIncome: "5200",
      employmentYears: 3,
      previousLandlordName: "Ann Meade",
      previousLandlordPhone: "937-555-0170",
      pets: "",
      vehicles: "Van",
      smoker: false,
      notes: "Happy to give references.",
    },
    [doc.key],
  );
  const invite = await inviteToScreen(landlord.id, application.id, "Ray Doyle");
  const screenToken = invite.url.split("/screen/")[1];

  // Unit 2B: an occupied tenancy with a real ledger, plus a lease out for signature.
  const occupied = await createUnit(
    landlord.id,
    landlord.plan,
    property.id,
    { label: "2B", beds: 2, baths: 1, sqft: 910, rent: "1850", deposit: "1850" },
    "Ray Doyle",
  );
  const tenancy = await importTenancy(
    landlord.id,
    occupied.id,
    {
      tenantNames: "Marta Alvarez",
      tenantEmails: "marta@example.com",
      tenantPhones: "+19375550142",
      startsOn: "2026-08-12",
      endsOn: "2027-08-11",
      rent: "1850",
      deposit: "1850",
      rentDueDay: 1,
      prorateFirstMonth: true,
      prorateLastMonth: true,
    },
    "Ray Doyle",
  );
  await upsertLateFeeRule(tenancy.id, {
    graceDays: 5,
    kind: "flat",
    amount: 5_000,
    maxPerMonthCents: null,
    enabled: true,
    stateCapAck: true,
    stateCapNote: "",
  });

  const ledger = await loadLedger(tenancy.id);
  for (const state of ledger.charges.slice(0, 2)) {
    await recordPayment({
      tenancyId: tenancy.id,
      chargeId: state.charge.id,
      amountCents: state.charge.amountCents,
      method: "manual_zelle",
      reference: "Zelle 8841",
    });
  }

  await openRequest({
    tenancyId: tenancy.id,
    title: "Kitchen tap dripping",
    body: "The cold tap has been dripping since Sunday and it is getting faster.",
    photoKeys: [await storeUpload(landlord.id, "request", { bytes: JPEG, contentType: "image/jpeg" }).then((r) => r.key)],
    openedBy: "tenant",
  });

  const lease = await draftLease(landlord.id, tenancy.id, { source: "state_template", landlordName: "Ray Doyle" }, "Ray Doyle");
  await sendLease(landlord.id, lease.id, "Ray Doyle");

  writeFileSync(
    "/tmp/tf-seed.env",
    [
      `SLUG=${listing.slug}`,
      `PORTAL=${tenancy.portalToken}`,
      `SCREEN=${screenToken}`,
      `SIGN=${lease.tenantToken}`,
      `PHOTO_KEY=${photo.key}`,
      `DOC_KEY=${doc.key}`,
      `LANDLORD_ID=${landlord.id}`,
      `TENANCY_ID=${tenancy.id}`,
      `APPLICATION_ID=${application.id}`,
      `UNIT_ID=${occupied.id}`,
      "",
    ].join("\n"),
  );

  console.log("seeded");
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
