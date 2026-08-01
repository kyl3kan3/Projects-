import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listCounters, ownedList, rewardsFor } from "@/lib/lists";
import { leaderboard } from "@/lib/signups";
import { count, maskEmail, rankLabel } from "@/lib/format";
import { kFactor } from "@/lib/referrals";
import { ListHeader } from "@/components/ListHeader";
import { AddRewardForm, RemoveRewardButton } from "./RewardEditor";

export const metadata: Metadata = { title: "Referrals" };
export const dynamic = "force-dynamic";

export default async function ReferralsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const list = await ownedList(user.id, (await params).id);
  if (!list) notFound();

  const [counters, leaders, tiers] = await Promise.all([
    listCounters(list.id),
    leaderboard(list.id, 20),
    rewardsFor(list.id),
  ]);
  const k = kFactor(counters.active + counters.review, counters.creditedReferrals);

  return (
    <main className="screen">
      <ListHeader
        list={list}
        section="Referrals"
        detail={
          <p className="t-secondary">
            {count(counters.creditedReferrals)} confirmed referrals · K-factor {k.toFixed(2)} · each
            one worth {list.boostPerReferral} positions
          </p>
        }
      />

      <section>
        <p className="t-label">Leaderboard</p>
        {leaders.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 12 }}>
            Nobody has referred anyone yet. The loop starts when the first person shares their link —
            they get it the moment they confirm their email.
          </p>
        ) : (
          <ul style={{ marginTop: 12 }}>
            {leaders.map((leader, index) => (
              <li key={leader.signup.id} className="row">
                <span
                  className="t-data"
                  style={{
                    flex: "none",
                    width: 36,
                    // Only the top referrer's numeral is flare; the row is
                    // otherwise identical (DESIGN.md).
                    color: index === 0 ? "var(--color-flare)" : "var(--color-text-3)",
                  }}
                >
                  {rankLabel(index + 1)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-data" style={{ display: "block" }}>
                    {maskEmail(leader.signup.email)}
                  </span>
                  <span className="t-secondary">
                    #{leader.signup.position} in line · +{leader.signup.boostPoints} positions earned
                  </span>
                </span>
                <span className="t-data" style={{ flex: "none" }}>
                  {leader.referrals}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 40 }}>
        <p className="t-label">Reward tiers</p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          Shown as gate cards on the page everyone lands on after confirming. Unlocks are emailed
          once, at the moment the referral is confirmed.
        </p>
        <ul style={{ marginTop: 12 }}>
          {tiers.map((tier) => (
            <li key={tier.id} className="row">
              <span className="t-data" style={{ flex: "none", width: 36, color: "var(--color-flare)" }}>
                {tier.threshold}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  {tier.label}
                </span>
                {tier.description ? <span className="t-secondary">{tier.description}</span> : null}
              </span>
              <RemoveRewardButton listId={list.id} rewardId={tier.id} label={tier.label} />
            </li>
          ))}
        </ul>
        {tiers.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 12, color: "var(--color-red)" }}>
            No tiers. Sharing still moves people up the queue, but there is nothing to aim at —
            add at least one.
          </p>
        ) : null}

        <div style={{ marginTop: 24 }}>
          <AddRewardForm listId={list.id} />
        </div>
      </section>
    </main>
  );
}
