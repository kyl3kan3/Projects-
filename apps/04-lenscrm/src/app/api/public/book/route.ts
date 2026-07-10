import { NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { mergeContract } from "@/lib/contracts";

/**
 * Public booking submission. Creates the client (or links), a pending session,
 * and freezes the contract from the booking type's template — the atomic
 * lead→booking→contract step. Double-booking is re-checked here inside the
 * write path. Deposit is created on signature (contract sign route).
 */
const Body = z.object({
  bookingTypeId: z.string().uuid(),
  startsAt: z.string(),
  name: z.string().min(1).max(160),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  partnerName: z.string().max(160).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const bt = await db.query.bookingTypes.findFirst({ where: eq(schema.bookingTypes.id, parsed.data.bookingTypeId) });
  if (!bt || !bt.isActive) return NextResponse.json({ error: "Booking type unavailable" }, { status: 404 });

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(startsAt.getTime() + bt.durationMinutes * 60_000);

  // Re-check for overlap under concurrency.
  const clash = await db.query.sessions.findFirst({
    where: and(
      eq(schema.sessions.accountId, bt.accountId),
      gte(schema.sessions.startsAt, new Date(startsAt.getTime() - bt.durationMinutes * 60_000)),
      lte(schema.sessions.startsAt, endsAt),
    ),
  });
  if (clash && clash.status !== "cancelled") return NextResponse.json({ error: "That time was just taken" }, { status: 409 });

  // Client: link by email or create.
  let client = await db.query.clients.findFirst({ where: and(eq(schema.clients.accountId, bt.accountId), eq(schema.clients.email, parsed.data.email)) });
  if (!client) {
    [client] = await db.insert(schema.clients).values({ accountId: bt.accountId, name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone, partnerName: parsed.data.partnerName }).returning();
  }

  const [session] = await db
    .insert(schema.sessions)
    .values({ accountId: bt.accountId, clientId: client.id, bookingTypeId: bt.id, title: `${bt.name} — ${client.name}`, startsAt, endsAt, location: bt.locationMode, status: "pending" })
    .returning();

  // Freeze contract from the booking type's template (or the account default).
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, bt.accountId) });
  const template = bt.contractTemplateId
    ? await db.query.contractTemplates.findFirst({ where: eq(schema.contractTemplates.id, bt.contractTemplateId) })
    : await db.query.contractTemplates.findFirst({ where: and(eq(schema.contractTemplates.accountId, bt.accountId), eq(schema.contractTemplates.shootType, bt.shootType)) });

  let contractId: string | null = null;
  if (template && account) {
    const deposit = Math.round((bt.priceCents * bt.depositPercent) / 100);
    const body = mergeContract(template.body, {
      client: { name: client.name, email: client.email, partnerName: client.partnerName ?? "" },
      session: { date: startsAt.toLocaleDateString("en-US", { dateStyle: "long" }), location: bt.locationMode },
      invoice: { total: `$${(bt.priceCents / 100).toLocaleString()}`, deposit: `$${(deposit / 100).toLocaleString()}` },
      studio: { name: account.name },
    });
    const [contract] = await db
      .insert(schema.contracts)
      .values({ accountId: bt.accountId, clientId: client.id, sessionId: session.id, templateId: template.id, title: template.name, body, status: "sent", sentAt: new Date() })
      .returning();
    contractId = contract.id;
    await db.update(schema.sessions).set({ contractId: contract.id }).where(eq(schema.sessions.id, session.id));
    // lead → booked pipeline (best effort)
    await db.update(schema.leads).set({ stage: "booked", convertedClientId: client.id }).where(and(eq(schema.leads.accountId, bt.accountId), eq(schema.leads.email, parsed.data.email)));
  }

  return NextResponse.json({ ok: true, sessionId: session.id, contractId, signUrl: contractId ? `/sign/${contractId}` : null });
}
