import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { deposits, jobs, organizations, proposals } from "@/db/schema";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = {
  title: "Deposit",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Where Stripe Checkout returns to.
 *
 * It deliberately does **not** mark anything paid — the webhook does that, because
 * a redirect can be faked and a homeowner who closes the tab still paid. This page
 * reads the deposit row and says either "received", or "we are waiting on the
 * bank", which is the honest state a second after Checkout completes.
 */
export default async function DepositReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ deposit?: string; cancelled?: string }>;
}) {
  const { deposit: depositId, cancelled } = await searchParams;
  const id = depositId ?? cancelled;

  let amountCents = 0;
  let paid = false;
  let companyName = "your contractor";
  let jobTitle: string | null = null;

  if (id) {
    const db = getDb();
    const [row] = await db.select().from(deposits).where(eq(deposits.id, id));
    if (row) {
      amountCents = row.amountCents;
      paid = row.status === "paid";
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, row.organizationId));
      if (org) companyName = org.name;
      const [jobRow] = await db
        .select({ title: jobs.title })
        .from(proposals)
        .innerJoin(jobs, eq(jobs.id, proposals.jobId))
        .where(eq(proposals.id, row.proposalId))
        .limit(1);
      jobTitle = jobRow?.title ?? null;
    }
  }

  return (
    <main className="paper-page">
      <div className="gutter" style={{ maxWidth: 560, margin: "0 auto", paddingTop: 56 }}>
        <p className="t-label">{companyName}</p>
        {cancelled ? (
          <>
            <h1 className="t-h2" style={{ marginTop: 12 }}>
              Payment cancelled
            </h1>
            <p className="t-body" style={{ marginTop: 12 }}>
              Nothing was charged. Your acceptance still stands — open your proposal link again
              whenever you are ready to pay the deposit.
            </p>
          </>
        ) : paid ? (
          <>
            <h1 className="t-h2" style={{ marginTop: 12 }}>
              Deposit received
            </h1>
            <p className="t-body" style={{ marginTop: 12 }}>
              {formatMoney(amountCents)} is in{jobTitle ? ` for ${jobTitle}` : ""}. A receipt is on its
              way to your inbox, and {companyName} has been notified to schedule the work.
            </p>
          </>
        ) : (
          <>
            <h1 className="t-h2" style={{ marginTop: 12 }}>
              Thanks — we are confirming with the bank
            </h1>
            <p className="t-body" style={{ marginTop: 12 }}>
              Your payment went through Stripe and we are waiting for the confirmation to land, which
              is usually seconds. You will get a receipt by email; nothing further is needed from you.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
