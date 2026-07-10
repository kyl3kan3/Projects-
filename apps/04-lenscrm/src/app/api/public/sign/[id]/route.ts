import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { hashDocument } from "@/lib/contracts";
import { createDepositAndBalance } from "@/lib/invoicing";
import { scheduleForSession } from "@/lib/automations";

/**
 * Client e-sign. Records intent (the click), consent to electronic business,
 * the signature (typed or drawn data URL), and IP/UA/timestamp. Freezes the
 * document hash, marks the contract signed, and fires the deposit-first
 * invoice — the moment the booking's money path opens.
 */
const Body = z.object({
  signerName: z.string().min(1).max(160),
  signerEmail: z.string().email(),
  signatureData: z.string().min(1),
  consent: z.literal(true),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please sign and consent to continue" }, { status: 400 });

  const contract = await db.query.contracts.findFirst({ where: eq(schema.contracts.id, id) });
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  if (contract.status === "signed") return NextResponse.json({ ok: true, already: true });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;

  await db.insert(schema.signatures).values({
    contractId: contract.id,
    signerName: parsed.data.signerName,
    signerEmail: parsed.data.signerEmail,
    signerRole: "client",
    signatureData: parsed.data.signatureData,
    consentedAt: new Date(),
    ipAddress: ip,
    userAgent: ua,
  });

  await db
    .update(schema.contracts)
    .set({ status: "signed", signedAt: new Date(), documentSha256: hashDocument(contract.body) })
    .where(eq(schema.contracts.id, contract.id));

  // Deposit-first flow: create the retainer + draft balance invoices.
  if (contract.sessionId && contract.clientId) {
    const session = await db.query.sessions.findFirst({ where: eq(schema.sessions.id, contract.sessionId) });
    const bt = session?.bookingTypeId ? await db.query.bookingTypes.findFirst({ where: eq(schema.bookingTypes.id, session.bookingTypeId) }) : null;
    if (session && bt) {
      await createDepositAndBalance({
        accountId: contract.accountId,
        clientId: contract.clientId,
        sessionId: session.id,
        priceCents: bt.priceCents,
        depositPercent: bt.depositPercent,
        sessionStartsAt: session.startsAt,
        title: session.title,
      });
      await scheduleForSession(contract.accountId, session.id);
    }
  }

  return NextResponse.json({ ok: true });
}
