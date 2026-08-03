import type { Metadata } from "next";
import Link from "next/link";
import { ConnectButton } from "@/app/(app)/setup/ConnectButton";
import { Icon } from "@/components/icons";
import { ScreenHeader } from "@/components/ui";
import { requireStylist } from "@/lib/auth";
import { duration, moneyShort } from "@/lib/format";
import { policySummary } from "@/lib/policy";
import { activeServices, currentPolicy, policyTerms } from "@/server/appointments";

export const metadata: Metadata = { title: "Set up your chair" };

/**
 * First run, in three steps — and the fourth line that matters more than any of them: take a
 * test booking through your own page, so the first real one is not the first time you have
 * seen it.
 *
 * Each step shows its own state rather than a checklist that lies: the handle is already
 * claimed by signing up, the policy already exists at v1 from a template, and Stripe is the
 * only one that can genuinely be unfinished.
 */
export default async function SetupPage() {
  const { stylist } = await requireStylist();
  const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3058";
  const [services, policy] = await Promise.all([
    activeServices(stylist.id),
    currentPolicy(stylist.id),
  ]);
  const connected = stylist.connectStatus === "active";

  return (
    <>
      <ScreenHeader label="Welcome" title="Set up your chair" />

      <section className="card" style={{ padding: 16, marginBottom: 12, display: "grid", gap: 8 }}>
        <p className="t-label" style={{ margin: 0, color: "var(--color-green)" }}>
          Step 1 · done
        </p>
        <p className="t-title" style={{ margin: 0 }}>
          Your handle is yours
        </p>
        <p className="t-mono" style={{ margin: 0, color: "var(--color-cobalt)", wordBreak: "break-all" }}>
          {base}/b/{stylist.handle}
        </p>
        <p className="t-secondary" style={{ margin: 0 }}>
          That is the link for your bio. It works now — a client who taps it sees your name,
          your services and your policy.
        </p>
      </section>

      <section className="card" style={{ padding: 16, marginBottom: 12, display: "grid", gap: 8 }}>
        <p
          className="t-label"
          style={{ margin: 0, color: services.length > 0 ? "var(--color-green)" : "var(--color-amber-text)" }}
        >
          Step 2 · {services.length > 0 ? "done" : "needed"}
        </p>
        <p className="t-title" style={{ margin: 0 }}>
          Services and your policy
        </p>
        {services.length === 0 ? (
          <p className="t-secondary" style={{ margin: 0 }}>
            Nothing to book yet. Add what you do, how long it takes, what it costs, and whether
            it asks for a deposit.
          </p>
        ) : (
          <div className="stack" style={{ gap: 4 }}>
            {services.map((s) => (
              <p key={s.id} className="t-secondary" style={{ margin: 0 }}>
                {s.name} · <span className="t-mono">{duration(s.durationMinutes)}</span> ·{" "}
                <span className="t-mono">{moneyShort(s.priceCents)}</span>
              </p>
            ))}
          </div>
        )}
        <p className="t-secondary" style={{ margin: 0 }}>
          {policy
            ? `Policy v${policy.version}: ${policySummary(policyTerms(policy))} You started from a template — edit it into your own words.`
            : "No policy yet, which means no bookings: there would be nothing for a client to agree to."}
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Link className="btn-quiet" href="/settings/services">
            {services.length > 0 ? "Edit services" : "Add your services"}
          </Link>
          <Link className="btn-quiet" href="/settings/policy">
            {policy ? "Edit your policy" : "Set your policy"}
          </Link>
        </div>
      </section>

      <section className="card" style={{ padding: 16, marginBottom: 12, display: "grid", gap: 8 }}>
        <p
          className="t-label"
          style={{ margin: 0, color: connected ? "var(--color-green)" : "var(--color-amber-text)" }}
        >
          Step 3 · {connected ? "done" : "optional, for now"}
        </p>
        <p className="t-title" style={{ margin: 0 }}>
          Connect Stripe for deposits and fees
        </p>
        <p className="t-secondary" style={{ margin: 0 }}>
          {connected
            ? "Connected. Deposits and no-show fees run on your own Stripe account — client money never touches ours."
            : "Your page takes bookings without this. What it cannot do yet is hold a card, which means a no-show costs you the hour and nothing else."}
        </p>
        <ConnectButton connected={connected} />
      </section>

      <section className="card" style={{ padding: 16, display: "grid", gap: 8 }}>
        <p className="t-label" style={{ margin: 0 }}>
          Then do this
        </p>
        <p className="t-title" style={{ margin: 0 }}>
          Book yourself, on your own page
        </p>
        <p className="t-secondary" style={{ margin: 0 }}>
          Open your link, book a slot with your own number, and look at what your clients see —
          the policy panel, the confirmation, the manage link. Then mark it a no-show from Today
          and watch the fee land in your ledger. The first time you see that should not be with
          a real client.
        </p>
        <Link className="btn btn-primary" href={`/b/${stylist.handle}`} target="_blank" rel="noreferrer">
          <Icon name="link-bio" size={18} />
          Open your booking page
        </Link>
        <Link className="btn-quiet" href="/today" style={{ justifySelf: "start" }}>
          Skip to Today
        </Link>
      </section>
    </>
  );
}
