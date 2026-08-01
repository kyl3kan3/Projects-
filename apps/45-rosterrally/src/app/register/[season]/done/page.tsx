import type { Metadata } from "next";
import Link from "next/link";
import { IconCheck } from "@/components/icons";
import { formatMoney } from "@/lib/money";
import { resolveHouseholdLink } from "@/lib/links";
import { getHouseholdMoney } from "@/lib/registration";
import { getPublicSeason } from "@/lib/registration";

export const metadata: Metadata = {
  title: "You are registered",
  robots: { index: false, follow: false },
};

/**
 * The landing after checkout. The token in the URL is the family's own link, so
 * this page can show them their position without asking them to sign in — and it
 * resolves that token properly rather than trusting anything else in the query.
 */
export default async function RegistrationDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string }>;
  searchParams: Promise<{ h?: string }>;
}) {
  const { season: slug } = await params;
  const { h } = await searchParams;
  const view = await getPublicSeason(slug);
  const resolved = h ? await resolveHouseholdLink(h) : null;

  if (!resolved?.ok) {
    return (
      <main className="world-day screen-narrow min-h-dvh">
        <div className="pt-12">
          <p className="t-label">{view?.club.name ?? "RosterRally"}</p>
          <h1 className="t-h2 mt-2">Registration received</h1>
          <p className="t-body mt-4">
            Check your email — it has your family page link, which shows your children&apos;s
            schedule, what you owe if anything, and the volunteer slots you can claim.
          </p>
        </div>
      </main>
    );
  }

  const household = resolved.household;
  const money = await getHouseholdMoney(household.id);

  return (
    <main className="world-day screen-narrow min-h-dvh">
      <div className="pt-12">
        <p className="t-label">{view?.club.name ?? "Your club"}</p>
        <h1 className="t-h2 mt-2 flex items-center gap-2">
          <IconCheck size={22} style={{ color: "var(--accent)" }} />
          You are registered
        </h1>
        <p className="t-body mt-4">
          Thanks, {household.contactName}. We have emailed {household.email} with your family page
          link — that one link is your schedule, your messages and your volunteer slots, all season.
        </p>

        <div className="panel mt-6 p-4">
          <div className="flex items-baseline justify-between">
            <span className="t-label">Still to pay</span>
            <span className="t-data-lg">{formatMoney(money.netDueCents)}</span>
          </div>
          {money.creditCents > 0 ? (
            <p className="t-secondary mt-2 turf">
              You are {formatMoney(money.creditCents)} in credit, and it is already counted above.
            </p>
          ) : null}
        </div>

        <p className="mt-6">
          <Link href={`/p/${h}`} className="btn btn-primary btn-full">
            Open your family page
          </Link>
        </p>
        <p className="t-secondary mt-4">
          Bookmark it. There is nothing to install and no password to forget.
        </p>
      </div>
    </main>
  );
}
