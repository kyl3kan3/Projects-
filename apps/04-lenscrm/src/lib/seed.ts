/**
 * Demo seed: a plausible studio so a new photographer's screens render with
 * real content — a booked wedding on the wall, a delivered gallery, an
 * awaiting-signature contract — before their first real lead (never lorem,
 * DESIGN_LANGUAGE rule 8). Idempotent per account.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { STARTER_TEMPLATES } from "@/lib/contracts";
import { ensureDefaultAutomations } from "@/lib/automations";

export async function seedStudio(accountId: string, photographerName: string): Promise<void> {
  const existing = await db.query.clients.findFirst({
    where: and(eq(schema.clients.accountId, accountId), eq(schema.clients.email, "amara.rivera@example.com")),
  });
  if (existing) return;

  await db.insert(schema.contractTemplates).values(
    STARTER_TEMPLATES.map((t) => ({ accountId, name: t.name, shootType: t.shootType, body: t.body })),
  );
  await ensureDefaultAutomations(accountId);

  // Availability: weekdays 10–18
  await db.insert(schema.availabilityRules).values(
    [1, 2, 3, 4, 5, 6].map((weekday) => ({ accountId, kind: "weekly" as const, weekday, startTime: "10:00", endTime: "18:00" })),
  );

  const [wedding] = await db
    .insert(schema.bookingTypes)
    .values({ accountId, name: "Wedding — full day", slug: "wedding-full-day", shootType: "wedding", durationMinutes: 480, priceCents: 480000, depositPercent: 30 })
    .returning();
  await db.insert(schema.bookingTypes).values({ accountId, name: "Family session — 90 min", slug: "family-90", shootType: "family", durationMinutes: 90, priceCents: 45000, depositPercent: 50 });

  // A booked wedding client
  const [rivera] = await db
    .insert(schema.clients)
    .values({ accountId, name: "Amara Rivera", partnerName: "Diego Rivera", email: "amara.rivera@example.com", phone: "555-0142", notes: "Golden-hour ceremony; wants a first-look." })
    .returning();

  const weddingDate = new Date();
  weddingDate.setDate(weddingDate.getDate() + 34);
  weddingDate.setHours(15, 0, 0, 0);
  const [session] = await db
    .insert(schema.sessions)
    .values({
      accountId, clientId: rivera.id, bookingTypeId: wedding.id,
      title: "Rivera wedding", startsAt: weddingDate, endsAt: new Date(weddingDate.getTime() + 8 * 3600_000),
      location: "The Ridgeline Estate", status: "confirmed",
    })
    .returning();

  await db.insert(schema.contracts).values({
    accountId, clientId: rivera.id, sessionId: session.id, title: "Wedding photography agreement",
    body: STARTER_TEMPLATES[0].body, status: "signed", sentAt: new Date(), signedAt: new Date(),
  });

  await db.insert(schema.invoices).values([
    { accountId, clientId: rivera.id, sessionId: session.id, kind: "deposit", status: "paid", subtotalCents: 144000, totalCents: 144000, paidAt: new Date() },
    { accountId, clientId: rivera.id, sessionId: session.id, kind: "balance", status: "open", subtotalCents: 336000, totalCents: 336000, dueAt: new Date(weddingDate.getTime() - 14 * 86400_000) },
  ]);

  // A delivered gallery for a past family client
  const [chen] = await db
    .insert(schema.clients)
    .values({ accountId, name: "The Chen family", email: "lily.chen@example.com", notes: "Fall mini-session, two kids." })
    .returning();
  const past = new Date();
  past.setDate(past.getDate() - 9);
  const [pastSession] = await db
    .insert(schema.sessions)
    .values({ accountId, clientId: chen.id, title: "Chen family session", startsAt: past, endsAt: new Date(past.getTime() + 90 * 60_000), location: "Prospect Park", status: "completed" })
    .returning();
  const [gallery] = await db
    .insert(schema.galleries)
    .values({ accountId, clientId: chen.id, sessionId: pastSession.id, name: "Chen family — Fall", slug: `chen-fall-${accountId.slice(0, 6)}`, status: "published", downloadPolicy: "web", deliveredAt: new Date(past.getTime() + 3 * 86400_000), totalBytes: 2_400_000_000 })
    .returning();
  // placeholder image rows (art-directed stand-ins; keys resolve to gradient tiles in the UI)
  await db.insert(schema.galleryImages).values(
    Array.from({ length: 12 }, (_, i) => ({
      galleryId: gallery.id, filename: `chen-${String(i + 1).padStart(2, "0")}.jpg`,
      originalKey: `demo/chen/${i + 1}`, sizeBytes: 200_000_000, width: 2000, height: i % 3 === 0 ? 3000 : 1333,
      processStatus: "ready" as const, sortOrder: i, derivatives: { thumb: `demo/${i}`, web: `demo/${i}`, full: `demo/${i}` },
    })),
  );

  // A fresh lead in the pipeline
  await db.insert(schema.leads).values({
    accountId, name: "Priya Okafor", email: "priya.okafor@example.com", shootType: "wedding",
    message: "Getting married next spring, love your golden-hour work!", stage: "consult", source: "Instagram",
  });

  void photographerName;
}
