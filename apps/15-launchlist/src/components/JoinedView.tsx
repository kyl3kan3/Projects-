import { notFound } from "next/navigation";
import { PositionRoll, Shaft } from "@/components/PositionRoll";
import { RewardGates } from "@/components/RewardGates";
import { ShareKit } from "@/components/ShareKit";
import { Wordmark } from "@/components/icons";
import { queueView } from "@/lib/signups";
import { normalizeReferralCode, positionSummary } from "@/lib/referrals";
import { count } from "@/lib/format";

/**
 * The position state — where someone lands after confirming, and the page they
 * come back to. Shared by the hosted path, the wildcard subdomain, and a
 * founder's custom domain, so all three are literally the same screen.
 *
 * The referral code in the URL is the capability: it is meant to be posted
 * publicly, so this shows that person's own standing and nothing about anyone
 * else — no other email, no list contents.
 *
 * Every number is present as text (`positionSummary`) as well as in the roll, so
 * the loop works with all animation removed.
 */
export async function JoinedView({
  code: rawCode,
  expectSlug,
  expectListId,
}: {
  code: string;
  /** Guard for the /l/{slug} path: the code must belong to this list. */
  expectSlug?: string;
  /** Guard for a custom domain: the code must belong to this list. */
  expectListId?: string;
}) {
  const code = normalizeReferralCode(rawCode);
  if (!code) notFound();

  const view = await queueView(code);
  if (!view) notFound();
  if (expectSlug && view.list.slug !== expectSlug) notFound();
  if (expectListId && view.list.id !== expectListId) notFound();

  const { signup, list, total, creditedReferrals, pendingReferrals, tiers, grantedRewardIds } = view;

  if (signup.status === "pending") {
    return (
      <main
        className="page-column"
        style={
          {
            "--page-ground": list.theme.ground,
            "--page-accent": list.theme.accent,
            background: list.theme.ground,
            minHeight: "100dvh",
            paddingTop: 40,
            paddingBottom: 40,
          } as React.CSSProperties
        }
      >
        <p className="t-label" style={{ color: "var(--page-accent)" }}>
          {list.name}
        </p>
        <h1 className="t-h2" style={{ marginTop: 24 }}>
          One click left.
        </h1>
        <p className="t-body" style={{ marginTop: 12, color: "var(--color-text-2)" }}>
          We sent a confirmation link to {signup.email}. Your place in line is held the moment you
          click it — and not before, which is what keeps the queue meaningful for everyone in it.
        </p>
      </main>
    );
  }

  if (signup.status === "blocked") {
    return (
      <main
        className="page-column"
        style={{ minHeight: "100dvh", paddingTop: 40, paddingBottom: 40 }}
      >
        <p className="t-label">{list.name}</p>
        <h1 className="t-h2" style={{ marginTop: 24 }}>
          This signup was rejected.
        </h1>
        <p className="t-body" style={{ marginTop: 12, color: "var(--color-text-2)" }}>
          If you think that&apos;s a mistake, reply to the confirmation email and the founder can
          reinstate it.
        </p>
      </main>
    );
  }

  const summary = positionSummary(signup.position, total, creditedReferrals, tiers);

  return (
    <main
      className="page-column"
      style={
        {
          "--page-ground": list.theme.ground,
          "--page-accent": list.theme.accent,
          background: list.theme.ground,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          paddingTop: 40,
          paddingBottom: 40,
        } as React.CSSProperties
      }
    >
      <header>
        <p className="t-label" style={{ color: "var(--page-accent)" }}>
          {list.name}
        </p>
      </header>

      <section
        style={{ position: "relative", marginTop: 32, textAlign: "center", paddingBottom: 8 }}
      >
        <Shaft />
        <div style={{ position: "relative" }}>
          <PositionRoll code={signup.referralCode} initialPosition={signup.position} />
        </div>
      </section>

      {/* The whole thing in words — always present, animation or not. */}
      <p className="t-secondary" style={{ marginTop: 12, textAlign: "center" }}>
        {summary}
      </p>
      <p className="t-secondary" style={{ marginTop: 4, textAlign: "center", color: "var(--color-text-3)" }}>
        {count(total)} {total === 1 ? "person" : "people"} in line
        {creditedReferrals > 0
          ? ` · you've brought ${creditedReferrals} of them`
          : ""}
      </p>

      {pendingReferrals > 0 ? (
        <p className="t-secondary" style={{ marginTop: 12, textAlign: "center" }}>
          {pendingReferrals} invite{pendingReferrals === 1 ? "" : "s"} sent but not confirmed yet —
          they count once your friend clicks the link in their email.
        </p>
      ) : null}

      <section style={{ marginTop: 32 }}>
        <ShareKit url={view.shareLink} productName={list.name} position={signup.position} />
        <p className="t-secondary" style={{ marginTop: 12 }}>
          Every friend who confirms moves you {list.boostPerReferral} places up.
        </p>
      </section>

      {tiers.length > 0 ? (
        <section style={{ marginTop: 40 }}>
          <p className="t-label">Rewards</p>
          <div style={{ marginTop: 12 }}>
            <RewardGates
              referrals={creditedReferrals}
              tiers={tiers}
              grantedIds={grantedRewardIds}
            />
          </div>
        </section>
      ) : null}

      {signup.status === "review" ? (
        <p className="panel t-secondary" style={{ marginTop: 32, padding: 16 }}>
          Your signup is being reviewed by the founder. You keep this place in line either way; a
          referral you sent won&apos;t be credited until the review clears.
        </p>
      ) : null}

      {signup.status === "unsubscribed" ? (
        <p className="panel t-secondary" style={{ marginTop: 32, padding: 16 }}>
          You&apos;ve unsubscribed from emails about {list.name}. Your place in line is unchanged —
          you just won&apos;t hear from us. Bookmark this page to check on it.
        </p>
      ) : null}

      <div style={{ flex: 1, minHeight: 40 }} />

      {list.badgeHidden ? null : (
        <footer className="hairline-t" style={{ paddingTop: 16, marginTop: 40 }}>
          <a
            className="t-label"
            href="https://launchlist.app"
            style={{ color: "var(--color-text-3)", display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            Powered by
            <Wordmark size={16} />
          </a>
        </footer>
      )}
    </main>
  );
}
