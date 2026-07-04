import Link from "next/link";
import { getSession } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { BrandMark } from "@/components/icons";
import { LeakCounter } from "@/components/marketing/LeakCounter";
import { StickyCTA } from "@/components/StickyCTA";

export const dynamic = "force-dynamic";

// One CTA phrase, repeated verbatim (MARKETING_PLAYBOOK law 7).
const CTA_LABEL = "See your 90-day leak";

export default async function LandingPage() {
  const session = await getSession();
  const cta = session ? "/dashboard" : "/signup";

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <BrandMark size={24} />
          Dunly
        </div>
        <nav className="flex items-center gap-2 text-sm">
          {session ? (
            <Link href="/dashboard" className="btn btn-secondary">Dashboard</Link>
          ) : (
            <>
              <Link href="/login" className="hidden text-[var(--color-muted)] hover:text-white sm:inline">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-primary">{CTA_LABEL}</Link>
            </>
          )}
        </nav>
      </header>

      {/* ============ 1 · HERO: the claim + the counter running ============ */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(120% 60% at 70% -10%, rgba(51,160,111,0.14), transparent 62%)" }}
        />
        <div className="noise" aria-hidden />
        <div className="relative mx-auto grid max-w-5xl items-center gap-10 px-5 pb-12 pt-10 sm:pt-16 lg:grid-cols-[1fr_420px]">
          <div>
            <p className="mono text-xs tracking-[0.14em] text-[var(--color-banknote)]">
              FOR STRIPE SUBSCRIPTION BUSINESSES · $20K–$500K MRR
            </p>
            <h1 className="t-display mt-4">
              A third of your churn
              <br />
              isn&apos;t churn.
              <br />
              <span style={{ color: "var(--color-banknote)" }}>It&apos;s a card decline.</span>
            </h1>
            <p className="mt-5 max-w-[36ch] text-[17px] leading-relaxed text-[var(--color-muted)]">
              Expired cards, empty accounts, bank friction. Stripe retries a
              few times, gives up, and cancels — Dunly gets that money back
              with smart retries, branded sequences, and attribution you can
              actually trust.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href={cta} className="btn btn-primary btn-block sm:w-auto">{CTA_LABEL}</Link>
              <a href="#math" className="btn btn-secondary btn-block sm:w-auto">Do the math first</a>
            </div>
            <p className="mt-3 text-xs text-[var(--color-faint)]">
              Connect Stripe, see what you would have recovered last quarter. Free for 14 days.
            </p>
          </div>
          <LeakCounter />
        </div>
      </section>

      {/* ============ 2 · THE MATH: the leak, quantified ============ */}
      <section id="math" className="paperband">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-14 sm:grid-cols-2 sm:py-20">
          <div>
            <p className="t-label">The math</p>
            <h2
              className="mt-2 font-semibold uppercase"
              style={{ fontSize: "clamp(32px, 5.5vw, 52px)", lineHeight: 1.04, letterSpacing: "-0.02em" }}
            >
              The MRR dip
              <br />
              nobody explains.
            </h2>
            <p className="mt-4 max-w-[44ch] text-[#4a5450]">
              A $50k-MRR SaaS with typical involuntary churn quietly leaks about
              <span className="mono font-semibold text-[#181d20]"> $48,000 a year</span> through
              failed payments. It never shows up in a cancellation survey — it shows up as
              <span className="mono text-[#181d20]"> invoice.payment_failed</span> webhooks
              nobody is reading.
            </p>
          </div>
          <div className="self-center">
            {[
              ["Failed payments, typical SaaS", "20–40% of all churn"],
              ["Stripe's default response", "3 dumb retries, cancel"],
              ["Recoverable with real dunning", "30–70%"],
              ["Dunly Starter", "$49 / month"],
            ].map(([k, v], i) => (
              <div
                key={k}
                className="flex items-baseline justify-between gap-4 py-3.5"
                style={{
                  borderTop: `1px solid ${i === 3 ? "#181d20" : "#dfe5e2"}`,
                  borderBottom: i === 3 ? "1px solid #181d20" : undefined,
                }}
              >
                <span className={i === 3 ? "font-semibold" : "text-sm text-[#4a5450]"}>{k}</span>
                <span className={`mono text-[15px] ${i === 3 ? "text-[#181d20]" : "text-[#8a948f]"}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 3 · HOW: three moves ============ */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
        <p className="t-label">How it works</p>
        <div className="mt-6 grid gap-10 sm:grid-cols-3">
          {[
            {
              n: "01",
              h: "Retries that think",
              p: "Timed to paydays and local mornings, suppressed when Stripe's own retries are live — never a double charge. Hard declines short-circuit straight to messaging.",
            },
            {
              n: "02",
              h: "Sequences in your voice",
              p: "Branded email from your domain with a hosted, no-login card-update page. Pre-dunning catches expiring cards before the failure ever happens.",
            },
            {
              n: "03",
              h: "Attribution you can audit",
              p: "Every recovered dollar is tied to the retry or message that caused it. Payments Stripe would have recovered anyway are shown — and never billed.",
            },
          ].map((s) => (
            <div key={s.n}>
              <p className="mono text-[13px] text-[var(--color-banknote)]">{s.n}</p>
              <h3 className="t-title mt-2 text-[17px]">{s.h}</h3>
              <p className="t-secondary mt-2 leading-relaxed">{s.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ 4 · RECEIPTS: the honest ledger ============ */}
      <section className="border-y border-[var(--color-line)]">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-16">
          <p className="t-label">The honest ledger</p>
          <h2 className="t-h2 mt-2">We show you what we didn&apos;t recover, too.</h2>
          <p className="t-secondary mt-2 max-w-[52ch]">
            Competitors count every payment that eventually succeeded. Dunly
            separates &quot;recovered by us&quot; from &quot;would have recovered
            anyway&quot; — the baseline row below is real, visible, and excluded
            from your bill.
          </p>
          <div className="mx-auto mt-8 max-w-md">
            <div className="rowlist">
              {[
                ["Recovered by Dunly", "$4,213.88", "banknote"],
                ["Prevented (pre-dunning)", "$1,240.00", "text"],
                ["Baseline — not counted, not billed", "$618.00", "faint"],
              ].map(([k, v, tone]) => (
                <div key={k} className="flex items-baseline justify-between py-3.5">
                  <span className="text-sm text-[var(--color-muted)]">{k}</span>
                  <span
                    className="mono text-[15px]"
                    style={{
                      color:
                        tone === "banknote"
                          ? "var(--color-banknote)"
                          : tone === "faint"
                            ? "var(--color-faint)"
                            : "var(--color-text)",
                    }}
                  >
                    {v}
                  </span>
                </div>
              ))}
            </div>
            <p className="mono mt-3 text-[11px] text-[var(--color-faint)]">
              Illustrative numbers — these are the exact three rows every Dunly dashboard shows.
            </p>
          </div>
        </div>
      </section>

      {/* ============ 5 · PRICING, anchored ============ */}
      <section className="paperband">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <p className="t-label">Pricing</p>
          <h2
            className="mt-2 font-semibold uppercase"
            style={{ fontSize: "clamp(30px, 5vw, 46px)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
          >
            It pays for itself
            <br />
            or you don&apos;t pay.
          </h2>
          <p className="mt-2 text-sm text-[#4a5450]">
            Flat plans by MRR under management — or the Performance plan: 25% of
            recovered revenue, capped at $2,000, no fixed fee.
          </p>
          <div className="mt-8 grid gap-0 sm:grid-cols-4 sm:gap-8">
            {(["starter", "growth", "scale", "performance"] as const).map((id) => {
              const p = PLANS[id];
              return (
                <div key={id} className="py-6 sm:py-0" style={{ borderTop: `1px solid ${id === "growth" ? "#181d20" : "#dfe5e2"}` }}>
                  <div className="flex items-baseline justify-between pt-4 sm:block">
                    <h3 className="font-semibold">{p.name}</h3>
                    <p className="mono mt-1 text-2xl font-semibold text-[#181d20]">
                      {p.priceMonthly > 0 ? `$${p.priceMonthly}` : "25%"}
                      <span className="text-sm font-normal text-[#8a948f]">
                        {p.priceMonthly > 0 ? " /mo" : " of recovered"}
                      </span>
                    </p>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-[13px] text-[#4a5450]">
                    {p.features.slice(0, 4).map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <Link
                    href={cta}
                    className={`btn btn-block mt-5 ${id === "growth" ? "btn-ink" : "border border-[#c9d1cd] text-[#181d20]"}`}
                  >
                    {CTA_LABEL}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ 6 · FINAL CTA ============ */}
      <section className="relative overflow-hidden px-5 pb-20 pt-16 text-center sm:pt-24">
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(120% 80% at 50% 120%, rgba(51,160,111,0.12), transparent 60%)" }}
        />
        <div className="noise" aria-hidden />
        <div className="relative">
          <h2 className="t-display" style={{ fontSize: "clamp(30px, 7vw, 56px)" }}>
            Your next MRR dip
            <br />
            <span style={{ color: "var(--color-banknote)" }}>doesn&apos;t have to happen.</span>
          </h2>
          <div className="mt-8">
            <Link href={cta} className="btn btn-primary">{CTA_LABEL}</Link>
          </div>
          <p className="mt-3 text-xs text-[var(--color-faint)]">
            14-day trial. Read-only until you flip the switch. Cancel in one click.
          </p>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl border-t border-[var(--color-line)] px-5 py-8 text-center text-xs text-[var(--color-faint)]">
        Dunly — built from the profitable-app-scaffolds portfolio.
      </footer>

      {!session && <StickyCTA href={cta} label={CTA_LABEL} />}
    </main>
  );
}
