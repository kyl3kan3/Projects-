import { config } from "dotenv";
config({ path: [".env.local"], quiet: true });
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_not_a_real_key";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_local_test_secret";

import Stripe from "stripe";
import { and, desc, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { deposits, jobs, organizations, proposalEvents, proposals } from "@/db/schema";

const BASE = "http://localhost:3031";
let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log("  ok  ", label);
  else {
    failures += 1;
    console.log("  FAIL", label, detail ?? "");
  }
};

async function main() {
  const db = getDb();
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.status, "accepted"))
    .orderBy(desc(proposals.sentAt))
    .limit(1);
  if (!proposal) throw new Error("no accepted proposal to pay");

  await db
    .update(organizations)
    .set({ stripeConnectAccountId: "acct_local_test", stripeConnectReady: true })
    .where(eq(organizations.id, proposal.organizationId));

  const sessionId = `cs_test_${Date.now().toString(36)}`;
  const [deposit] = await db
    .insert(deposits)
    .values({
      organizationId: proposal.organizationId,
      proposalId: proposal.id,
      amountCents: proposal.depositCents,
      currency: "usd",
      status: "pending",
      stripeAccountId: "acct_local_test",
      stripeCheckoutSessionId: sessionId,
    })
    .returning();

  const payload = JSON.stringify({
    id: `evt_local_${Date.now().toString(36)}`,
    object: "event",
    type: "checkout.session.completed",
    account: "acct_local_test",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        mode: "payment",
        payment_intent: `pi_local_${Date.now().toString(36)}`,
        amount_total: deposit.amountCents,
        metadata: {
          quotefoxDepositId: deposit.id,
          quotefoxProposalId: proposal.id,
          quotefoxOrgId: proposal.organizationId,
        },
      },
    },
  });
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: "whsec_local_test_secret",
  });

  // A forged signature must be refused.
  const forged = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
    body: payload,
  });
  check("a forged signature is refused", forged.status === 400, forged.status);

  const first = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
  check("a signed delivery is accepted", first.status === 204, first.status);

  for (let i = 0; i < 5; i++) {
    const replay = await fetch(`${BASE}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": header },
      body: payload,
    });
    check(`replay ${i + 1} acked without reprocessing`, replay.status === 204, replay.status);
  }

  const [after] = await db.select().from(proposals).where(eq(proposals.id, proposal.id));
  check("proposal is deposit_paid", after.status === "deposit_paid", after.status);
  const [job] = await db.select().from(jobs).where(eq(jobs.id, proposal.jobId));
  check("job is won", job.status === "won", job.status);
  const paidEvents = await db
    .select()
    .from(proposalEvents)
    .where(
      and(eq(proposalEvents.proposalId, proposal.id), eq(proposalEvents.type, "deposit_paid")),
    );
  check("exactly one deposit_paid event after six deliveries", paidEvents.length === 1, paidEvents.length);
  const rows = await db.select().from(deposits).where(eq(deposits.proposalId, proposal.id));
  check("exactly one paid deposit row", rows.filter((r) => r.status === "paid").length === 1, rows.map((r) => r.status));

  console.log(failures === 0 ? "\nWEBHOOK CHECKS PASSED" : `\n${failures} WEBHOOK CHECK(S) FAILED`);
  await closeDb();
  process.exit(failures === 0 ? 0 : 1);
}
void main();
