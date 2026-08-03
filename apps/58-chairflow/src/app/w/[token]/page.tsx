import type { Metadata } from "next";
import Link from "next/link";
import { ClaimButton } from "@/app/w/[token]/ClaimButton";
import { DetailRow } from "@/components/ui";
import { formatWhen } from "@/lib/dates";
import { moneyShort } from "@/lib/format";
import { verifyToken } from "@/lib/tokens";
import { offeredEntry } from "@/server/waitlist-read";

export const metadata: Metadata = {
  title: "A slot opened up",
  robots: { index: false, follow: false },
};

/**
 * The waitlist offer. First tap wins.
 *
 * The page itself does not claim anything: it renders the offer and a button, and the claim is
 * a POST. That is not fussiness — `next/link` prefetches on hover, so if opening this page
 * claimed the slot, a message-preview crawler would take somebody's appointment before they
 * ever saw it.
 */
export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ missed?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const verified = await verifyToken("waitlist_claim", token);
  const offer = verified ? await offeredEntry(verified.subjectId, verified.hash) : null;

  if (query.missed === "1") {
    return (
      <Shell title="Just missed it">
        <p className="t-secondary" style={{ margin: "8px 0 0" }}>
          Somebody claimed that slot first. You are still on the waitlist, so the next opening
          comes to you.
        </p>
      </Shell>
    );
  }

  if (!verified || !offer) {
    return (
      <Shell title="This offer has expired">
        <p className="t-secondary" style={{ margin: "8px 0 0" }}>
          Waitlist offers last an hour and then move on to the next person. You are still on the
          list — the next cancellation will come your way.
        </p>
      </Shell>
    );
  }

  if (offer.kind === "claimed") {
    return (
      <Shell title="You have it">
        <p className="t-secondary" style={{ margin: "8px 0 24px" }}>
          {formatWhen(offer.stylist.timezone, offer.startsAt)} is yours. Your confirmation is on
          its way.
        </p>
        <Link className="btn btn-secondary btn-full" href={`/b/${offer.stylist.handle}`}>
          {offer.stylist.displayName}&apos;s booking page
        </Link>
      </Shell>
    );
  }

  return (
    <Shell title="A slot opened up">
      <p className="t-secondary" style={{ margin: "4px 0 20px" }}>
        {offer.client.firstName}, this just came free with {offer.stylist.displayName}. First tap
        gets it.
      </p>
      <section className="card" style={{ padding: 16, marginBottom: 20 }}>
        <DetailRow term={offer.service.name}>{moneyShort(offer.service.priceCents)}</DetailRow>
        <DetailRow term="When">{formatWhen(offer.stylist.timezone, offer.startsAt)}</DetailRow>
        {offer.stylist.chairLocation && (
          <DetailRow term="Where">{offer.stylist.chairLocation}</DetailRow>
        )}
        <DetailRow term="Offer expires">
          {formatWhen(offer.stylist.timezone, offer.expiresAt)}
        </DetailRow>
      </section>
      <ClaimButton token={token} />
      <p className="t-secondary" style={{ margin: "16px 0 0" }}>
        Claiming books it under {offer.stylist.displayName}&apos;s usual policy — the same one you
        agreed to before. Your confirmation will carry it again.
      </p>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="screen-plain" style={{ maxWidth: 480, paddingTop: 40 }}>
      <p className="t-label" style={{ margin: 0 }}>
        Waitlist
      </p>
      <h1 className="t-h2" style={{ margin: "4px 0 0" }}>
        {title}
      </h1>
      {children}
    </main>
  );
}
