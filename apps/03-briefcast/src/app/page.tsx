import Link from "next/link";
import { getSession } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { BrandMark, IconArrowRight, IconCheck } from "@/components/icons";
import { CrmProof } from "@/components/marketing/CrmProof";
import { StickyCTA } from "@/components/StickyCTA";

export const dynamic = "force-dynamic";

// One CTA phrase, repeated verbatim (MARKETING_PLAYBOOK law 7).
const CTA_LABEL = "Start free — 14 days";

export default async function LandingPage() {
  const session = await getSession();
  const cta = session ? "/pipeline" : "/signup";

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <BrandMark size={24} /> Briefcast
        </div>
        <nav className="flex items-center gap-2 text-sm">
          {session ? (
            <Link href="/pipeline" className="btn btn-secondary">Open app</Link>
          ) : (
            <>
              <Link href="/login" className="hidden text-[var(--color-stone)] hover:text-[var(--color-ink)] sm:inline">Log in</Link>
              <Link href="/signup" className="btn btn-primary">{CTA_LABEL}</Link>
            </>
          )}
        </nav>
      </header>

      {/* 1 · HERO + the device */}
      <section className="mx-auto max-w-5xl px-5 pt-8 sm:pt-14">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_400px]">
          <div>
            <p className="t-label mb-4 text-[var(--color-blue)]">For sales teams &amp; agencies on HubSpot</p>
            <h1 className="t-display">The notes wrote themselves. So did the CRM update.</h1>
            <p className="mt-5 measure text-[17px] leading-relaxed text-[var(--color-stone)]">
              A bot joins your Zoom, Meet, and Teams calls, writes the brief, and pushes the
              real field changes — stage, next step, close date — straight into HubSpot.
              Fathom-simple capture, Gong-grade deal intelligence, at SMB prices.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href={cta} className="btn btn-primary btn-block sm:w-auto">{CTA_LABEL}</Link>
              <a href="#how" className="btn btn-secondary btn-block sm:w-auto">See a brief sync</a>
            </div>
            <p className="mt-3 text-xs text-[var(--color-stone-2)]">No card. A sample brief is waiting inside.</p>
          </div>
          <div id="how"><CrmProof /></div>
        </div>
      </section>

      {/* 2 · THE ENEMY */}
      <section className="mx-auto mt-20 max-w-5xl border-y border-[var(--color-line)] px-5 py-14 sm:mt-28">
        <div className="grid gap-10 sm:grid-cols-2">
          <div>
            <h2 className="t-h2">Notes are a tax. CRM hygiene is worse.</h2>
            <p className="mt-4 measure text-[var(--color-stone)]">
              Reps either take notes during the call and stop selling, or after and forget half of it.
              Either way the CRM stays empty until end of quarter, updated from memory, under duress.
              Pipeline reviews run on stale data — and the only record of what the prospect said lives
              in one rep&apos;s head.
            </p>
          </div>
          <div className="rowlist self-center">
            {[
              ["Notetakers stop at the notes doc", "transcript in their app"],
              ["\"CRM integration\"", "attaches a summary, not fields"],
              ["Gong-grade deal intelligence", "$100–250/seat, sales-led"],
              ["Briefcast", "field-level write-back, $39/seat"],
            ].map(([k, v], i) => (
              <div key={k} className="flex items-baseline justify-between gap-4 py-3.5">
                <span className={i === 3 ? "t-title" : "text-sm text-[var(--color-stone)]"}>{k}</span>
                <span className={`mono text-right ${i === 3 ? "text-[var(--color-ink)]" : "text-[var(--color-stone-2)]"}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 · HOW (three moves) */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <div className="grid gap-10 sm:grid-cols-3">
          {[
            { n: "01", h: "It joins and listens", p: "A visible, consent-first bot records Zoom, Meet, and Teams. Deepgram transcribes with speaker labels; nobody types." },
            { n: "02", h: "It extracts what matters", p: "Claude pulls decisions, owner-tagged action items, risks, and concrete field updates — tuned for sales calls, not generic meetings." },
            { n: "03", h: "It writes back, on your terms", p: "Review each field change or auto-apply the confident ones. Every write is logged with old→new and is fully reversible." },
          ].map((s) => (
            <div key={s.n}>
              <p className="mono text-[var(--color-blue)]">{s.n}</p>
              <h3 className="t-title mt-2 text-[17px]">{s.h}</h3>
              <p className="t-secondary mt-2 leading-relaxed">{s.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4 · RECEIPTS — a real field change */}
      <section className="mx-auto max-w-5xl border-y border-[var(--color-line)] px-5 py-14">
        <p className="t-label">What actually lands in your CRM</p>
        <div className="mx-auto mt-6 max-w-md">
          <div className="card p-4">
            <p className="mono text-[var(--color-stone)]">Acme Corp — Platform renewal</p>
            <div className="mt-3 rowlist">
              {[
                ["DEAL STAGE", "Discovery", "Proposal"],
                ["NEXT STEP", null, "Send revised SOW; book CFO call"],
                ["CLOSE DATE", "Sep 30", "Aug 30"],
              ].map(([label, oldV, newV]) => (
                <div key={label} className="py-2.5">
                  <p className="t-label">{label}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[15px]">
                    {oldV ? <span className="field-old">{oldV}</span> : <span className="text-[var(--color-stone-2)]">empty</span>}
                    <IconArrowRight size={14} className="text-[var(--color-stone-2)]" />
                    <span className="font-medium">{newV}</span>
                  </p>
                </div>
              ))}
            </div>
            <p className="mono mt-3 flex items-center gap-1.5 text-[var(--color-green)]">
              <IconCheck size={13} /> Synced · 3 fields · every change reversible
            </p>
          </div>
          <p className="t-secondary mt-3 text-center">
            The exact field-change rows Briefcast shows before it writes — nothing invented, each tied to the transcript.
          </p>
        </div>
      </section>

      {/* 5 · PRICING */}
      <section id="pricing" className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="t-h2 sm:text-center">Priced per seat. The CRM write-back is the product.</h2>
        <p className="t-secondary mt-2 sm:text-center">14-day trial on Pro. Annual saves ~2 months.</p>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {(["starter", "pro", "business"] as const).map((id) => {
            const p = PLANS[id];
            return (
              <div key={id} className={`card p-5 ${id === "pro" ? "border-[var(--color-ink)]" : ""}`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="t-title">
                    {p.name}
                    {id === "pro" && <span className="pill pill-blue ml-2">Most popular</span>}
                  </h3>
                </div>
                <p className="mt-2" style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: 34 }}>
                  ${p.perSeatMonthly}
                  <span className="text-base text-[var(--color-stone-2)]" style={{ fontFamily: "var(--font-inter)", fontWeight: 400 }}> /seat/mo</span>
                </p>
                <ul className="mt-4 space-y-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[var(--color-stone)]">
                      <IconCheck size={15} className="mt-0.5 text-[var(--color-green)]" /> {f}
                    </li>
                  ))}
                </ul>
                <Link href={cta} className={`btn btn-block mt-5 ${id === "pro" ? "btn-primary" : "btn-secondary"}`}>{CTA_LABEL}</Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* 6 · FINAL CTA */}
      <section className="mx-auto max-w-5xl px-5 pb-20 pt-4 text-center">
        <h2 className="t-display" style={{ fontSize: "clamp(28px, 7vw, 46px)" }}>
          End your next call with the CRM already done.
        </h2>
        <div className="mt-6"><Link href={cta} className="btn btn-primary">{CTA_LABEL}</Link></div>
        <p className="mt-3 text-xs text-[var(--color-stone-2)]">14-day trial. Consent-first recording. Cancel anytime.</p>
      </section>

      <footer className="mx-auto max-w-5xl border-t border-[var(--color-line)] px-5 py-8 text-center text-xs text-[var(--color-stone-2)]">
        Briefcast — built from the profitable-app-scaffolds portfolio.
      </footer>

      {!session && <StickyCTA href={cta} label={CTA_LABEL} />}
    </main>
  );
}
