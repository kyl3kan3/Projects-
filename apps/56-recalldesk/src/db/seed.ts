/**
 * src/db/seed.ts — `npm run db:seed`
 *
 * A demonstration practice with a plausible roster, so a fresh clone has something
 * to look at and so the whole pipeline can be exercised end to end without an
 * afternoon of clicking.
 *
 * Everything here is fictional and obviously so — the practice, the patients, the
 * numbers in the 555-01xx reserved range, and `example.com` addresses. Nothing in
 * this file is real patient data, and nothing in the product depends on it.
 *
 * It is idempotent by email: running it twice does not create a second practice.
 */

import "@/lib/load-env";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  bookings,
  campaignSteps,
  campaigns,
  enrollments,
  locations,
  patients,
  practices,
  templates,
  touches,
  users,
  visits,
} from "@/db/schema";
import { hashPassword, seedPracticeContent } from "@/lib/auth";
import { addDays, addMonths, toDayStart } from "@/lib/dates";
import { attributeBookingsForLocation } from "@/server/ledger";
import { recomputeOverdue } from "@/server/overdue";
import { buildQueue, queueDateFor } from "@/server/queue";

const OWNER_EMAIL = "dana@cedarhollowdental.example";
const OWNER_PASSWORD = "cedarhollow2026";

/** 40 fictional patients with the mix a real 2,000-patient roster has. */
const NAMES: [string, string][] = [
  ["Rosalind", "Mbeki"], ["Desmond", "Okafor"], ["Marguerite", "Bellweather"],
  ["Jae Sun", "Park"], ["Amara", "Nwosu"], ["Tobias", "Lindqvist"],
  ["Priya", "Ramanathan"], ["Callum", "Fitzgerald"], ["Ines", "Salgado"],
  ["Hector", "Villanueva"], ["Nadia", "Haddad"], ["Bertram", "Ashcombe"],
  ["Yuki", "Tanabe"], ["Solomon", "Adeyemi"], ["Clarissa", "Whitmore"],
  ["Emeka", "Chukwu"], ["Freya", "Sorensen"], ["Ravi", "Deshpande"],
  ["Lucienne", "Barbier"], ["Mateus", "Cardoso"], ["Anneke", "Vos"],
  ["Kwame", "Boateng"], ["Sinead", "O'Rourke"], ["Dmitri", "Volkov"],
  ["Thandiwe", "Mokoena"], ["Gerald", "Pemberton"], ["Noor", "Al-Rashid"],
  ["Cormac", "Delaney"], ["Beatrix", "Hollingsworth"], ["Ji-Woo", "Choi"],
  ["Ignacio", "Fuentes"], ["Adaeze", "Eze"], ["Roland", "Kessler"],
  ["Marisol", "Vega"], ["Anton", "Petrenko"], ["Halima", "Suleiman"],
  ["Fergus", "MacAllister"], ["Camila", "Restrepo"], ["Oskar", "Nowak"],
  ["Winifred", "Attenborough"],
];

async function main(): Promise<void> {
  const db = getDb();
  const today = toDayStart(new Date());

  const [existing] = await db.select().from(users).where(eq(users.email, OWNER_EMAIL));
  if (existing) {
    console.log(`Demo practice already seeded. Sign in as ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
    await closeDb();
    return;
  }

  const [practice] = await db
    .insert(practices)
    .values({
      name: "Cedar Hollow Dental",
      plan: "recall_engine",
      trialEndsAt: addDays(new Date(), 11),
      settings: { visitValueCents: 31_000, attributionWindowDays: 30 },
    })
    .returning();

  const [location] = await db
    .insert(locations)
    .values({
      practiceId: practice.id,
      name: "Cedar Hollow — Maple St",
      timezone: "America/Chicago",
      phone: "+15125550147",
      bookingNotice:
        "Tell us when suits and the front desk will call you back to confirm. Cleanings run about 45 minutes.",
      quietStartHour: 9,
      quietEndHour: 19,
      hourlySendCap: 120,
    })
    .returning();

  await db.insert(users).values([
    {
      practiceId: practice.id,
      email: OWNER_EMAIL,
      name: "Dana Whitfield",
      role: "owner",
      passwordHash: await hashPassword(OWNER_PASSWORD),
      defaultLocationId: location.id,
    },
    {
      practiceId: practice.id,
      email: "front-desk@cedarhollowdental.example",
      name: "Marisol Vega",
      role: "front_desk",
      passwordHash: await hashPassword(OWNER_PASSWORD),
      defaultLocationId: location.id,
    },
  ]);

  await seedPracticeContent(practice.id, location.id);

  // --- the roster ---
  const created: { id: string; index: number }[] = [];
  for (let i = 0; i < NAMES.length; i++) {
    const [firstName, lastName] = NAMES[i];
    // A spread of lapse lengths, so every bucket has patients in it.
    const monthsAgo = [4, 5, 7, 9, 11, 14, 18, 22, 27, 40][i % 10] + Math.floor(i / 10);
    const interval = i % 7 === 0 ? 4 : i % 11 === 0 ? 12 : 6;
    const hasEmail = i % 9 !== 3;
    const hasPhone = i % 8 !== 5;
    const smsConsent = hasPhone && i % 3 !== 2;

    const [patient] = await db
      .insert(patients)
      .values({
        locationId: location.id,
        externalId: `AC${1041 + i}`,
        firstName,
        lastName,
        email: hasEmail
          ? `${firstName.toLowerCase().replace(/[^a-z]/g, "")}.${lastName.toLowerCase().replace(/[^a-z]/g, "")}@example.com`
          : null,
        phone: hasPhone ? `+1512555${String(100 + i).padStart(4, "0")}` : null,
        emailConsent: hasEmail,
        smsConsent,
        recallIntervalMonths: interval,
        doNotContact: i === 17,
        emailBouncedAt: i === 23 ? addDays(new Date(), -40) : null,
        smsOptedOutAt: i === 29 ? addDays(new Date(), -60) : null,
      })
      .returning();

    // Two or three past visits on that patient's own cycle.
    const visitRows = [] as { patientId: string; visitedOn: Date; kind: "hygiene" | "other" }[];
    for (let n = 0; n < 3; n++) {
      const when = addMonths(today, -(monthsAgo + n * interval));
      visitRows.push({ patientId: patient.id, visitedOn: when, kind: "hygiene" });
    }
    if (i % 6 === 0) {
      visitRows.push({
        patientId: patient.id,
        visitedOn: addMonths(today, -(monthsAgo + 2)),
        kind: "other",
      });
    }
    // A couple of patients already have their next appointment on the books.
    if (i === 4 || i === 12) {
      visitRows.push({ patientId: patient.id, visitedOn: addDays(today, 9), kind: "hygiene" });
    }
    await db.insert(visits).values(visitRows).onConflictDoNothing();
    created.push({ id: patient.id, index: i });
  }

  await recomputeOverdue({ locationId: location.id, inferIntervals: true });

  // --- a campaign that has been running for three weeks ---
  const practiceTemplates = await db
    .select()
    .from(templates)
    .where(eq(templates.practiceId, practice.id));
  const emailTemplate = practiceTemplates.find((t) => t.channel === "email");
  const smsTemplate = practiceTemplates.find((t) => t.channel === "sms");

  const [campaign] = await db
    .insert(campaigns)
    .values({
      locationId: location.id,
      name: "6–12 month winback (spring)",
      segment: { buckets: ["m6_12", "m12_24"], requiresEmail: true, excludeEnrolled: true },
      status: "running",
      maxTouchesPerPatient: 3,
      startedAt: addDays(new Date(), -21),
    })
    .returning();

  if (emailTemplate && smsTemplate) {
    await db.insert(campaignSteps).values([
      { campaignId: campaign.id, stepOrder: 1, offsetDays: 0, channel: "email", templateId: emailTemplate.id },
      { campaignId: campaign.id, stepOrder: 2, offsetDays: 7, channel: "email", templateId: emailTemplate.id },
      { campaignId: campaign.id, stepOrder: 3, offsetDays: 14, channel: "sms", templateId: smsTemplate.id },
    ]);
  }

  // Enrol a slice and give them a plausible touch history.
  const enrolled = created.filter((c) => c.index % 3 === 0 && c.index !== 17).slice(0, 12);
  for (const [n, entry] of enrolled.entries()) {
    const enrolledAt = addDays(new Date(), -(20 - n));
    await db.insert(enrollments).values({
      campaignId: campaign.id,
      patientId: entry.id,
      status: n < 4 ? "stopped_booked" : "active",
      enrolledAt,
      nextStepOrder: n < 4 ? 3 : 2,
      nextSendAt: n < 4 ? null : addDays(new Date(), 1),
    });

    await db.insert(touches).values({
      patientId: entry.id,
      locationId: location.id,
      campaignId: campaign.id,
      channel: "email",
      templateId: emailTemplate?.id ?? null,
      status: n === 5 ? "bounced" : "delivered",
      providerMessageId: `seed_email_${entry.index}`,
      occurredAt: addDays(enrolledAt, 0),
    });
    if (n % 2 === 0) {
      await db.insert(touches).values({
        patientId: entry.id,
        locationId: location.id,
        campaignId: campaign.id,
        channel: "email",
        templateId: emailTemplate?.id ?? null,
        status: "delivered",
        providerMessageId: `seed_email2_${entry.index}`,
        occurredAt: addDays(enrolledAt, 7),
      });
    }
  }

  // --- bookings: some attributable, one deliberately not ---
  for (const [n, entry] of enrolled.slice(0, 4).entries()) {
    await db.insert(bookings).values({
      patientId: entry.id,
      locationId: location.id,
      bookedAt: addDays(new Date(), -(6 - n)),
      appointmentOn: addDays(today, n + 1),
      source: n % 2 === 0 ? "booking_link" : "call",
    });
  }
  // A walk-in nobody had contacted: this one must NOT be attributed.
  const walkIn = created.find((c) => c.index === 31);
  if (walkIn) {
    await db.insert(bookings).values({
      patientId: walkIn.id,
      locationId: location.id,
      bookedAt: addDays(new Date(), -3),
      appointmentOn: addDays(today, 4),
      source: "front_desk_manual",
    });
  }

  const attribution = await attributeBookingsForLocation({
    locationId: location.id,
    practiceId: practice.id,
  });

  const queue = await buildQueue({
    locationId: location.id,
    queueDate: queueDateFor(location.timezone),
    visitValueCents: 31_000,
  });

  console.log(
    [
      `Seeded ${NAMES.length} patients at ${location.name}.`,
      `Attributed ${attribution.attributed} bookings, ${attribution.skippedNoTouch} had no qualifying touch.`,
      `Built a queue of ${queue.tasksCreated}.`,
      `Sign in: ${OWNER_EMAIL} / ${OWNER_PASSWORD}`,
    ].join("\n"),
  );
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
