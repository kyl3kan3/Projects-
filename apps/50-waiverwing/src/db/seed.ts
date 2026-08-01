/**
 * Development seed: one account, one location, a published waiver, and a
 * Saturday's worth of real-shaped traffic — adults, a guardian with two children,
 * a returning customer whose waiver has expired, and a minor who has since turned
 * eighteen. That last one exists because it is the case the product has to get
 * right and the one you cannot see without data.
 *
 * Safe to run repeatedly: it clears the demo account first and rebuilds it.
 *
 *   npm run db:seed
 */

import "@/lib/load-env";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { accounts, locations, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { newQrToken } from "@/lib/qr";
import { createWaiver, publish } from "@/lib/waivers";
import { captureSigning } from "@/lib/signatures";
import { checkIn } from "@/lib/checkin";
import { createIncident, linkParticipant } from "@/lib/incidents";
import { TEMPLATES } from "@/lib/templates";
import { addDays } from "@/lib/time";
import { DEFAULT_MINOR_RULE } from "@/db/schema";

const DEMO_EMAIL = "dana@graniteworks.example";
const TZ = "America/Denver";

/** A DOB that makes someone exactly `years` old today. */
function dobForAge(years: number, offsetDays = 0): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate() - offsetDays),
  );
  return d.toISOString().slice(0, 10);
}

async function main() {
  const db = getDb();

  const [existing] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
  if (existing) {
    console.log("Removing the previous demo account…");
    await db.delete(accounts).where(eq(accounts.id, existing.accountId));
  }

  const [account] = await db
    .insert(accounts)
    .values({
      name: "Granite Works Climbing",
      plan: "front_desk",
      trialEndsAt: addDays(new Date(), 9),
    })
    .returning();

  await db.insert(users).values({
    accountId: account.id,
    email: DEMO_EMAIL,
    name: "Dana Reyes",
    passwordHash: await hashPassword("granite-works-demo"),
    role: "owner",
  });

  const [location] = await db
    .insert(locations)
    .values({
      accountId: account.id,
      name: "Granite Works — Denver",
      timezone: TZ,
      kioskPin: "4417",
      qrToken: newQrToken(),
    })
    .returning();

  const template = TEMPLATES.find((t) => t.key === "climbing")!;
  const waiver = await createWaiver({
    accountId: account.id,
    title: "Granite Works climbing and bouldering waiver",
    expiryRule: "days_365",
    minorRule: { ...DEFAULT_MINOR_RULE, ageOfMajority: template.ageOfMajority },
    activityTags: template.activityTags,
    draftBlocks: template.blocks,
  });
  const version = await publish(waiver.id, account.id);
  console.log(`Published ${waiver.title} v${version.version}`);

  const sharedAnswers = {
    emergency_name: "Priya Raman",
    emergency_phone: "3035550142",
    emergency_relationship: "Partner",
    medical_flags: "",
    first_visit: "no",
  };
  const initials = {
    clause_belay: "SN",
    clause_ground_fall: "SN",
    clause_supervision: "SN",
  };

  const base = {
    accountId: account.id,
    locationId: location.id,
    timeZone: TZ,
    version,
    answers: sharedAnswers,
    initials,
    signatureKind: "typed" as const,
    disclosureAccepted: true,
    channel: "qr" as const,
    ip: "198.51.100.24",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
  };

  // 1. An adult signing on their own phone before arriving.
  const sam = await captureSigning({
    ...base,
    signer: {
      firstName: "Sam",
      lastName: "Nguyen",
      dob: "1991-08-04",
      email: "sam.nguyen@example.com",
      phone: "(303) 555-0117",
    },
    signatureData: "Sam Nguyen",
  });

  // 2. A guardian signing for two children in one pass, at the counter kiosk.
  await captureSigning({
    ...base,
    channel: "kiosk",
    signer: {
      firstName: "Dana",
      lastName: "Torres",
      dob: "1988-06-14",
      email: "dana.torres@example.com",
      phone: "3035550188",
    },
    minors: [
      {
        firstName: "Maya",
        lastName: "Torres",
        dob: dobForAge(13),
        relationship: "Parent",
        answers: { medical_flags: "Inhaler in the blue chalk bag." },
      },
      { firstName: "Leo", lastName: "Torres", dob: dobForAge(10), relationship: "Parent" },
    ],
    initials: { ...initials, clause_belay: "DT", clause_ground_fall: "DT", clause_supervision: "DT" },
    signatureData: "Dana Torres",
  });

  // 3. A returning customer whose annual waiver lapsed 40 days ago.
  await captureSigning({
    ...base,
    signedAt: addDays(new Date(), -405),
    signer: {
      firstName: "Priya",
      lastName: "Raman",
      dob: "1986-02-19",
      email: "priya.raman@example.com",
      phone: "3035550142",
    },
    initials: { clause_belay: "PR", clause_ground_fall: "PR", clause_supervision: "PR" },
    signatureData: "Priya Raman",
  });

  // 4. The case that matters: signed for at 17 by a parent, now 18.
  await captureSigning({
    ...base,
    signedAt: addDays(new Date(), -200),
    signer: {
      firstName: "Marcus",
      lastName: "Hale",
      dob: "1979-11-02",
      email: "marcus.hale@example.com",
      phone: "3035550163",
    },
    minors: [
      {
        firstName: "Ada",
        lastName: "Hale",
        // Turned 18 thirty days ago, so a guardian's authority has now lapsed.
        dob: dobForAge(18, 30),
        relationship: "Parent",
      },
    ],
    initials: { clause_belay: "MH", clause_ground_fall: "MH", clause_supervision: "MH" },
    signatureData: "Marcus Hale",
  });

  // A check-in for the covered adult, proving coverage at entry.
  await checkIn(account.id, location.id, sam.participantIds[0], { timeZone: TZ });

  // An incident, with the waiver in force snapshotted onto the link.
  const incident = await createIncident({
    accountId: account.id,
    locationId: location.id,
    occurredAt: addDays(new Date(), -1),
    title: "Ankle roll on the landing mat at boulder 7",
    description:
      "Sam came off the top of the blue V3 on boulder 7 and landed with his left foot half on the seam between two mats. He walked off unaided and iced it at the desk for fifteen minutes. Declined an ambulance. Mat seam was re-taped and the problem was closed for the rest of the day. Sam said he would see his own doctor if it was still sore on Monday.",
    whereText: "Boulder 7, mat seam",
  });
  await linkParticipant(
    account.id,
    incident.id,
    sam.participantIds[0],
    "Landed on the mat seam; iced at the desk; declined transport.",
    TZ,
  );

  console.log("\nSeeded. Sign in with:");
  console.log(`  email    ${DEMO_EMAIL}`);
  console.log("  password granite-works-demo");
  console.log(`\nQR sign link: /sign/${location.qrToken}`);
  console.log(`Kiosk:        /kiosk/${location.id}  (PIN 4417)`);

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
