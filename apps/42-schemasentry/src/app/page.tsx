import type { Metadata } from "next";
import Link from "next/link";
import { allRules } from "@/core/rules";
import { formatPrice, PAID_PLANS, PLANS } from "@/lib/plans";
import { BrandMark, IconShieldCheck } from "@/components/icons";
import { HeroDiff } from "@/components/marketing/HeroDiff";

/**
 * The landing page, built to MARKETING_PLAYBOOK.md.
 *
 *   Enemy        the 2am customer ticket that tells you your API broke
 *   One sentence a renamed field should fail the build, not the integration
 *   Arc          hook -> tension -> proof -> offer
 *   Device       "the breaking change caught in CI, not prod"
 *   CTA          "Catch the next one in CI", repeated verbatim four times
 *
 * Every number on this page is either arithmetic the reader can check or a count
 * read out of the code at render time (`allRules().length`). There are no
 * testimonials, no logos and no usage figures, because this product has no
 * customers yet and inventing them is a debt the brand never pays off
 * (playbook law 5). The one demo is labelled as what it is.
 */

export const metadata: Metadata = {
  title: "SchemaSentry — the breaking change caught in CI, not prod",
  description:
    "Diff your OpenAPI spec between deploys. Fail the PR when a change would break a consumer, name which consumer, and publish the changelog they read. Ten-minute setup, one side only.",
};

const CTA = "Catch the next one in CI";

const BREAKAGE = [
  { change: "Remove a value from a response enum", unit: "unit tests", them: "at 2am" },
  { change: "Drop a field out of `required`", unit: "unit tests", them: "intermittently" },
  { change: "Let a field become null", unit: "unit tests", them: "on the first null" },
  { change: "Add a required request property", unit: "unit tests", them: "on their next deploy" },
];

export default async function LandingPage() {
  const ruleCount = allRules().length;
  const breakingRules = allRules().filter((r) => r.level === "breaking").length;
  const riskyRules = allRules().filter((r) => r.level === "risky").length;

  return (
    <>
      <header className="gutter" style={{ paddingBlock: 16 }}>
        <div
          className="wrap"
          style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 44 }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--color-text)" }}>
            <BrandMark size={22} />
            <span className="t-title">SchemaSentry</span>
          </span>
          <span style={{ flex: 1 }} />
          <Link href="/login" className="t-secondary" style={{ color: "var(--color-text-2)" }}>
            Sign in
          </Link>
        </div>
      </header>

      {/* ---------------------------------------------------------- hero ---- */}
      <main>
        <section className="gutter" style={{ paddingTop: 32, paddingBottom: 56 }}>
          <div className="wrap" style={{ maxWidth: 760 }}>
            <h1
              className="t-h2"
              style={{ fontSize: "clamp(30px, 8.5vw, 46px)", lineHeight: 1.08, margin: "0 0 16px" }}
            >
              A renamed field should fail the build, not the integration.
            </h1>
            <p className="t-body" style={{ color: "var(--color-text-2)", margin: "0 0 32px", maxWidth: "48ch" }}>
              SchemaSentry diffs your OpenAPI spec between deploys, fails the pull request when a change would
              break a consumer, names which consumer, and publishes the changelog they actually read.
            </p>

            {/* Law 2: the machine running, above the fold, before any claim. */}
            <HeroDiff />

            <div style={{ display: "grid", gap: 12, marginTop: 32 }}>
              <Link href="/signup" className="btn btn-primary btn-full">
                {CTA}
              </Link>
              <p className="t-secondary" style={{ margin: 0, textAlign: "center" }}>
                14 days, no card. Or run it right now with no account:{" "}
                <span className="t-data">npx schemasentry diff old.yaml new.yaml</span>
              </p>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- device ---- */}
        <section className="gutter hairline-t" style={{ paddingBlock: 56 }}>
          <div className="wrap" style={{ maxWidth: 760 }}>
            <p className="t-label" style={{ color: "var(--color-text-2)", margin: "0 0 16px" }}>
              The whole product, in one line
            </p>
            <p
              className="t-display settle"
              style={{ margin: "0 0 20px", textTransform: "none", letterSpacing: "-0.01em" }}
            >
              Caught in <span style={{ color: "var(--color-green)" }}>CI</span>, not in{" "}
              <span style={{ color: "var(--color-break-text)" }}>prod</span>.
            </p>
            <p className="t-body" style={{ color: "var(--color-text-2)", margin: 0, maxWidth: "52ch" }}>
              The same change, found in two places. In CI it is a red check and a two-line conversation on a pull
              request. In production it is an incident, a partner on the phone, and an apology email you write
              yourself.
            </p>
          </div>
        </section>

        {/* --------------------------------------------------------- tension -- */}
        <section className="gutter hairline-t" style={{ paddingBlock: 56 }}>
          <div className="wrap" style={{ maxWidth: 760 }}>
            <h2 className="t-h2" style={{ margin: "0 0 8px" }}>
              None of these fail a single test you have
            </h2>
            <p className="t-secondary" style={{ margin: "0 0 24px", maxWidth: "50ch" }}>
              Your suite tests your code against itself. It cannot know that somebody else was reading the field
              you just stopped promising.
            </p>
            <ul className="rows hairline-t hairline-b" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {BREAKAGE.map((row) => (
                <li key={row.change} className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                  <span className="dot" data-level="breaking" aria-hidden="true" />
                  <span className="t-body" style={{ flex: 1, minWidth: 200 }}>
                    {row.change}
                  </span>
                  <span className="t-secondary" style={{ flex: "none" }}>
                    passes your {row.unit} · breaks them {row.them}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* --------------------------------------------------------- the math -- */}
        <section className="gutter hairline-t" style={{ paddingBlock: 56 }}>
          <div className="wrap" style={{ maxWidth: 760 }}>
            <h2 className="t-h2" style={{ margin: "0 0 24px" }}>
              The arithmetic, done in front of you
            </h2>
            <div className="rows hairline-t hairline-b">
              {[
                { label: "One prevented integration outage", value: "an incident you never open" },
                { label: "Team plan, five APIs watched", value: `${formatPrice(PLANS.team.priceCents)}/mo` },
                { label: "Per API, per month", value: `${formatPrice(Math.round(PLANS.team.priceCents / PLANS.team.apiLimit))}` },
                { label: "Engineer-hours that buys, at $120/hr", value: "about ten minutes" },
              ].map((row) => (
                <div key={row.label} className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                  <span className="t-body" style={{ flex: 1, minWidth: 200 }}>
                    {row.label}
                  </span>
                  <span className="t-data" style={{ flex: "none", color: "var(--color-text)" }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <p className="t-secondary" style={{ margin: "20px 0 0", maxWidth: "50ch" }}>
              Priced against the incident, not against a seat count. Everyone on the team should see the alert, so
              nobody is charged for looking.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- receipts -- */}
        <section className="gutter hairline-t" style={{ paddingBlock: 56 }}>
          <div className="wrap" style={{ maxWidth: 760 }}>
            <p className="t-label" style={{ color: "var(--color-text-2)", margin: "0 0 16px" }}>
              What is actually in the box
            </p>
            <h2 className="t-h2" style={{ margin: "0 0 24px" }}>
              {ruleCount} rules, every one of them arguable
            </h2>
            <p className="t-body" style={{ color: "var(--color-text-2)", margin: "0 0 24px", maxWidth: "52ch" }}>
              {breakingRules} classified breaking, {riskyRules} risky, the rest compatible. Each finding cites the
              rule that produced it, the exact JSON pointer it was found at, and the OpenAPI semantics it violates
              — so a verdict you disagree with is a conversation, not a support ticket. Promote, demote or ignore
              any rule per API.
            </p>
            <div className="card">
              <p className="t-label" style={{ color: "var(--color-text-2)", margin: "0 0 12px" }}>
                A finding, in full
              </p>
              <p className="t-title" style={{ margin: "0 0 8px" }}>
                Removed enum value <span className="t-data">cancelled</span> from{" "}
                <span className="t-data">status</span>
              </p>
              <p className="t-secondary" style={{ margin: "0 0 12px" }}>
                Consumers branching on this value lose a case, and whatever the API returns instead is a value
                their closed enum type cannot deserialize. The behaviour it represented did not disappear — it
                moved somewhere undocumented.
              </p>
              <div className="xscroll">
                <p className="t-data" style={{ color: "var(--color-diffdim-text)", margin: 0, whiteSpace: "nowrap" }}>
                  /paths/~1v1~1orders/get/responses/200/content/application~1json/schema/properties/status/enum
                </p>
              </div>
              <p className="t-secondary" style={{ margin: "12px 0 0" }}>
                <span className="t-label level-label" data-level="breaking">
                  Breaks:
                </span>{" "}
                Acme webhooks · iOS app
              </p>
            </div>
            <p className="t-secondary" style={{ margin: "16px 0 0" }}>
              Staged demo, not a customer: SchemaSentry is pre-launch and has no case studies to show you yet. The
              engine output above and in the hero is real; the API and the consumer names are ours.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------- objection killer -- */}
        <section className="gutter hairline-t" style={{ paddingBlock: 56 }}>
          <div className="wrap" style={{ maxWidth: 760 }}>
            <h2 className="t-h2" style={{ margin: "0 0 8px" }}>
              &ldquo;A check that cries wolf gets <span className="t-data">continue-on-error</span> in a week&rdquo;
            </h2>
            <p className="t-secondary" style={{ margin: "0 0 24px", maxWidth: "50ch" }}>
              Correct, and it is the only failure mode that matters. Four things are built against it.
            </p>
            <div className="rows hairline-t hairline-b">
              {[
                {
                  title: "Three levels, not a boolean",
                  body: "Breaking, risky, compatible. CI fails on breaking by default; risky is a conversation, not a block.",
                },
                {
                  title: "Cosmetic edits diff to nothing",
                  body: "Specs are canonicalized first: reordered keys, renamed $ref targets, 3.0 nullable versus 3.1 type unions, and a semantics-preserving allOf all produce zero findings.",
                },
                {
                  title: "Your taste wins",
                  body: "Any rule can be promoted, demoted or ignored per API. If additive enum values break your consumers, make that rule breaking and the verdict changes.",
                },
                {
                  title: "Acknowledge, never silence",
                  body: "Disagree with a finding and you write a note. The check goes neutral for it; the reasoning and your name stay in the timeline and the audit log forever.",
                },
              ].map((item) => (
                <div key={item.title} className="row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <IconShieldCheck size={18} style={{ color: "var(--color-green)" }} />
                    <span className="t-title">{item.title}</span>
                  </span>
                  <span className="t-secondary">{item.body}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 32 }}>
              <Link href="/signup" className="btn btn-primary btn-full">
                {CTA}
              </Link>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- setup ---- */}
        <section className="gutter hairline-t" style={{ paddingBlock: 56 }}>
          <div className="wrap" style={{ maxWidth: 760 }}>
            <h2 className="t-h2" style={{ margin: "0 0 8px" }}>
              One side only. No consumer has to agree to anything.
            </h2>
            <p className="t-secondary" style={{ margin: "0 0 24px", maxWidth: "50ch" }}>
              Two commands and a spec path. No gateway, no traffic capture, nothing for your partners to install.
            </p>
            <div className="terminal xscroll">
              <span className="terminal-prompt"># in your PR workflow{"\n"}</span>
              <span className="terminal-prompt">$ </span>npx schemasentry check openapi.yaml --api payments --fail-on breaking
              {"\n\n"}
              <span className="terminal-prompt"># after you deploy{"\n"}</span>
              <span className="terminal-prompt">$ </span>npx schemasentry push openapi.yaml --api payments --version $GIT_SHA
            </div>
            <p className="t-secondary" style={{ margin: "16px 0 0" }}>
              The local <span className="t-data">diff</span> is free forever and needs no account. The paid line is
              the history: which version each consumer integrated against, who a change breaks, and the changelog
              page they read.
            </p>
          </div>
        </section>

        {/* --------------------------------------------------------- pricing -- */}
        <section className="gutter hairline-t" style={{ paddingBlock: 56 }}>
          <div className="wrap" style={{ maxWidth: 760 }}>
            <h2 className="t-h2" style={{ margin: "0 0 8px" }}>
              Priced by APIs watched
            </h2>
            <p className="t-secondary" style={{ margin: "0 0 24px" }}>
              Never per-seat. Never per-request. 14 days on Team, no card.
            </p>
            <div className="rows hairline-t hairline-b">
              {PAID_PLANS.map((plan) => (
                <div key={plan} className="row" style={{ flexWrap: "wrap", gap: 12 }}>
                  <span style={{ flex: 1, minWidth: 200 }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span className="t-title">{PLANS[plan].name}</span>
                      <span className="t-data" style={{ color: "var(--color-text-2)" }}>
                        {formatPrice(PLANS[plan].priceCents)}/mo
                      </span>
                    </span>
                    <span className="t-secondary" style={{ display: "block" }}>
                      {PLANS[plan].blurb}
                    </span>
                  </span>
                  <span className="t-data" style={{ flex: "none", color: "var(--color-text-2)" }}>
                    {PLANS[plan].apiLimit} API{PLANS[plan].apiLimit === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 32 }}>
              <Link href="/signup" className="btn btn-primary btn-full">
                {CTA}
              </Link>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- final CTA -- */}
        <section className="gutter hairline-t" style={{ paddingBlock: 56, paddingBottom: 120 }}>
          <div className="wrap" style={{ maxWidth: 760 }}>
            <h2
              className="t-h2"
              style={{ fontSize: "clamp(26px, 7vw, 38px)", lineHeight: 1.1, margin: "0 0 16px" }}
            >
              You will ship a breaking change this quarter. Decide now who finds it.
            </h2>
            <p className="t-body" style={{ color: "var(--color-text-2)", margin: "0 0 32px", maxWidth: "46ch" }}>
              Ten minutes to wire in. Two commands. The first prevented incident pays for the year.
            </p>
            <Link href="/signup" className="btn btn-primary btn-full">
              {CTA}
            </Link>
          </div>
        </section>
      </main>

      {/* Sticky mobile CTA: the same words, a fifth time. */}
      <div
        className="gutter"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          paddingBlock: 12,
          paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
          background: "color-mix(in srgb, var(--color-panel) 94%, transparent)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid var(--color-hairline)",
        }}
      >
        <div className="wrap" style={{ maxWidth: 760 }}>
          <Link href="/signup" className="btn btn-primary btn-full">
            {CTA}
          </Link>
        </div>
      </div>

      <footer className="gutter hairline-t" style={{ paddingBlock: 32, paddingBottom: 120 }}>
        <div className="wrap" style={{ maxWidth: 760, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span
            className="t-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--color-text-2)" }}
          >
            <BrandMark size={18} />
            SchemaSentry
          </span>
          <span style={{ flex: 1 }} />
          <Link href="/login" className="t-secondary">
            Sign in
          </Link>
          <Link href="/signup" className="t-secondary">
            Start a trial
          </Link>
        </div>
      </footer>
    </>
  );
}
