import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ownedList } from "@/lib/lists";
import { overview, SOURCE_LABELS } from "@/lib/dashboard";
import { joinFeed, sourceBreakdown } from "@/lib/signups";
import { count, maskEmail, relativeTime } from "@/lib/format";
import { featureAllowed, limitLabel, plan, signupCapacity } from "@/lib/plans";
import { emailConfigured } from "@/lib/email";
import { ListHeader } from "@/components/ListHeader";
import { IconFlag, IconLayout, IconSend } from "@/components/icons";
import { billableSignupCount } from "@/lib/lists";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function ListOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const list = await ownedList(user.id, (await params).id);
  if (!list) notFound();

  const [data, feed, sources, used] = await Promise.all([
    overview(list.id),
    joinFeed(list.id, 12),
    sourceBreakdown(list.id),
    billableSignupCount(list.id),
  ]);
  const capacity = signupCapacity(user.plan, used);
  const limits = plan(user.plan);
  const now = new Date();

  return (
    <main className="screen">
      <ListHeader list={list} section="Overview" />

      <section>
        <p className="t-stat">{count(data.tiles.total)}</p>
        <p className="t-data" style={{ marginTop: 8, color: "var(--color-text-2)" }}>
          {data.tiles.today > 0 ? `+${data.tiles.today} TODAY` : "NO SIGNUPS IN THE LAST 24H"}
        </p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {limitLabel(limits.signupsPerList)} included on {limits.name}
          {data.tiles.pending > 0 ? ` · ${data.tiles.pending} waiting to confirm` : ""}
        </p>
      </section>

      {!capacity.allowed ? (
        <p
          className="panel"
          role="status"
          style={{ marginTop: 20, padding: 16, color: "var(--color-red)" }}
        >
          <span className="t-title" style={{ display: "block" }}>
            The page has stopped accepting signups.
          </span>
          <span className="t-secondary" style={{ display: "block", marginTop: 4 }}>
            {capacity.reason} Everyone already on the list keeps their position.{" "}
            <Link href="/settings/billing">See plans</Link>
          </span>
        </p>
      ) : null}

      {!emailConfigured() ? (
        <p className="panel t-secondary" role="status" style={{ marginTop: 20, padding: 16 }}>
          <span className="t-title" style={{ display: "block", color: "var(--color-red)" }}>
            No email provider is configured.
          </span>
          Confirmation links are written to the server log instead of being delivered, so nobody can
          finish signing up. Set <span className="t-data">RESEND_API_KEY</span> before you share the
          page.
        </p>
      ) : null}

      <section style={{ marginTop: 32, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Tile
          label="K-factor"
          value={data.tiles.kFactor.toFixed(2)}
          note={
            data.counters.creditedReferrals === 0
              ? "No referrals yet"
              : `${data.counters.creditedReferrals} confirmed referrals`
          }
          borderRight
        />
        <Tile
          label="Conversion"
          value={data.counters.pageViews === 0 ? "—" : `${data.tiles.conversion}%`}
          note={
            data.counters.pageViews === 0
              ? "No page views recorded"
              : `${count(data.counters.pageViews)} page views`
          }
        />
      </section>

      {data.tiles.review > 0 ? (
        <Link
          href={`/lists/${list.id}/signups?filter=review`}
          className="panel"
          style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 24, padding: 16, color: "inherit" }}
        >
          <span style={{ color: "var(--color-red)", display: "inline-flex" }}>
            <IconFlag size={20} />
          </span>
          <span style={{ flex: 1 }}>
            <span className="t-title" style={{ display: "block" }}>
              {data.tiles.review} signup{data.tiles.review === 1 ? "" : "s"} held for review
            </span>
            <span className="t-secondary">
              They hold their place but don&apos;t pay their referrer until you decide.
            </span>
          </span>
        </Link>
      ) : null}

      <section style={{ marginTop: 40 }}>
        <p className="t-label">Funnel</p>
        <ul style={{ marginTop: 12 }}>
          {data.funnel.map((stage) => (
            <li key={stage.label} className="row">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  {stage.label}
                </span>
                <span className="t-secondary">{stage.note}</span>
              </span>
              <span style={{ textAlign: "right", flex: "none" }}>
                <span className="t-data" style={{ display: "block" }}>
                  {count(stage.value)}
                </span>
                {stage.ofPrevious !== null ? (
                  <span className="t-label" style={{ display: "block", marginTop: 4 }}>
                    {stage.ofPrevious}%
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 40 }}>
        <p className="t-label">Last 14 days</p>
        <Curve points={data.daily} />
      </section>

      {sources.length > 0 ? (
        <section style={{ marginTop: 40 }}>
          <p className="t-label">Sources</p>
          <ul style={{ marginTop: 12 }}>
            {sources.map((s) => (
              <li key={s.source} className="row">
                <span className="t-title" style={{ flex: 1 }}>
                  {SOURCE_LABELS[s.source]}
                </span>
                <span className="t-data">{count(s.count)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section style={{ marginTop: 40 }}>
        <p className="t-label">Who just joined</p>
        {feed.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 12 }}>
            Nothing yet. Share{" "}
            <Link href={`/lists/${list.id}/builder`}>your page</Link> and this fills up in real
            time.
          </p>
        ) : (
          <ul style={{ marginTop: 12 }}>
            {feed.map(({ signup, referrerEmail }) => (
              <li key={signup.id} className="row">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-data" style={{ display: "block" }}>
                    {maskEmail(signup.email)}
                  </span>
                  <span className="t-secondary">
                    {referrerEmail ? `via ${maskEmail(referrerEmail)} · ` : ""}
                    {relativeTime(signup.createdAt, now)}
                    {signup.status === "pending" ? " · unconfirmed" : ""}
                    {signup.status === "review" ? " · held for review" : ""}
                    {signup.status === "blocked" ? " · rejected" : ""}
                    {signup.status === "unsubscribed" ? " · unsubscribed" : ""}
                  </span>
                </span>
                <span className="t-data" style={{ flex: "none", color: "var(--color-text-3)" }}>
                  {signup.position > 0 ? `#${signup.position}` : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="thumb-cta">
        {featureAllowed(user.plan, "emailBlasts") ? (
          <Link href={`/lists/${list.id}/blasts/new`} className="btn btn-primary btn-full">
            <IconSend size={18} />
            Send launch blast
          </Link>
        ) : (
          <Link href={`/lists/${list.id}/builder`} className="btn btn-primary btn-full">
            <IconLayout size={18} />
            Edit the page
          </Link>
        )}
      </div>
    </main>
  );
}

function Tile({
  label,
  value,
  note,
  borderRight,
}: {
  label: string;
  value: string;
  note: string;
  borderRight?: boolean;
}) {
  return (
    <div
      style={{
        paddingRight: borderRight ? 16 : 0,
        paddingLeft: borderRight ? 0 : 16,
        borderRight: borderRight ? "1px solid var(--color-hairline)" : undefined,
      }}
    >
      <p className="t-label">{label}</p>
      <p className="t-data" style={{ fontSize: 24, marginTop: 8 }}>
        {value}
      </p>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        {note}
      </p>
    </div>
  );
}

/**
 * The 14-day curve. Bars, not a spline — a bar for a day with no signups is
 * visibly empty, where a smoothed line would invent a slope through it.
 */
function Curve({ points }: { points: { day: string; count: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const total = points.reduce((sum, p) => sum + p.count, 0);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 64 }}>
        {points.map((p) => (
          <span
            key={p.day}
            title={`${p.day}: ${p.count}`}
            style={{
              flex: 1,
              height: `${Math.max(2, (p.count / max) * 100)}%`,
              background: p.count === 0 ? "var(--color-hairline)" : "var(--color-flare)",
              borderRadius: 1,
              opacity: p.count === 0 ? 1 : 0.85,
            }}
          />
        ))}
      </div>
      <p className="t-secondary" style={{ marginTop: 8 }}>
        {total === 0
          ? "No signups in the last fourteen days."
          : `${count(total)} in fourteen days · busiest day ${max}`}
      </p>
    </div>
  );
}
