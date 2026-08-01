import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { associations } from "@/db/schema";
import { verifyPortalToken, verifyStepUpToken } from "@/lib/portal";
import { stripeConfigured } from "@/lib/stripe";
import { Notice } from "@/components/ledger";
import { IconBank, IconChevronLeft } from "@/components/icons";
import { AutopaySetup } from "./AutopaySetup";

export const metadata: Metadata = {
  title: "Set up autopay",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The step-up gate. Reaching this screen requires **both** a valid portal token
 * and a valid, unexpired step-up token minted for this exact member and emailed
 * to their address. A forwarded portal link alone stops here.
 */
export default async function AutopayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { token } = await params;
  const { step } = await searchParams;
  const result = await verifyPortalToken(token);

  if (!result.ok) {
    return (
      <main className="screen-plain pt-12" style={{ maxWidth: 480 }}>
        <p className="t-label">DuesDesk</p>
        <h1 className="t-h2 mt-4">This link is no longer valid.</h1>
        <p className="t-body mt-3">
          Open the most recent email from your association, or ask the board for a new link.
        </p>
      </main>
    );
  }

  const { member, household } = result.session;
  const stepValid = Boolean(step) && (await verifyStepUpToken(step!, member.id));
  const [association] = await getDb()
    .select()
    .from(associations)
    .where(eq(associations.id, household.associationId));

  if (!stepValid) {
    return (
      <main className="screen-plain pt-12" style={{ maxWidth: 480 }}>
        <Link href={`/pay/${token}`} className="btn-quiet inline-flex items-center gap-1">
          <IconChevronLeft size={18} />
          Your household
        </Link>
        <h1 className="t-h2 mt-6">We need to confirm it is you.</h1>
        <p className="t-body mt-3">
          {step
            ? "That confirmation link has expired, or it was issued for a different person. They last fifteen minutes on purpose."
            : "Autopay can only be set up from the confirmation link we email you."}
        </p>
        <div className="mt-6">
          <Notice>
            The page you came from can be forwarded to anybody. Storing a bank account against a
            household should take more than holding a forwarded link, so we email you a one-time
            confirmation first. Go back and press &ldquo;Set up autopay&rdquo; to get a fresh one.
          </Notice>
        </div>
      </main>
    );
  }

  return (
    <main className="screen-plain pt-12" style={{ maxWidth: 480 }}>
      <Link href={`/pay/${token}`} className="btn-quiet inline-flex items-center gap-1">
        <IconChevronLeft size={18} />
        Your household
      </Link>
      <p className="t-label mt-6">{association?.name}</p>
      <h1 className="t-h2 mt-2">Autopay for {household.unitLabel}</h1>
      <p className="t-secondary mt-2">
        Confirmed as {member.email}. Add the account to be charged on each due date.
      </p>

      {!stripeConfigured() || !association?.stripeAccountId ? (
        <div className="mt-8">
          <Notice tone="warn">
            Your association has not finished connecting its bank details with Stripe, so autopay
            cannot be switched on yet. A check or an online one-off payment still works — contact your
            board.
          </Notice>
        </div>
      ) : (
        <div className="panel mt-8 p-5">
          <p className="t-secondary flex items-start gap-2">
            <IconBank size={18} className="green" />
            A bank account costs the association about 80 cents per payment; a card costs about 2.9%.
            Either is fine — the bank account leaves more money in the association.
          </p>
          <div className="mt-4">
            <AutopaySetup token={token} step={step!} />
          </div>
        </div>
      )}

      <p className="t-secondary mt-8">
        You can stop autopay at any time by replying to a DuesDesk email. Your card or bank details
        are held by Stripe against your association&apos;s own account — DuesDesk never sees or
        stores them.
      </p>
    </main>
  );
}
