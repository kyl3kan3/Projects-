import Link from "next/link";
import { getSession } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { BrandMark, IconCheck } from "@/components/icons";
import { ThreadDevice } from "@/components/marketing/ThreadDevice";
import { StickyCTA } from "@/components/StickyCTA";

export const dynamic = "force-dynamic";
const CTA_LABEL = "Start free — 14 days";

export default async function LandingPage() {
  const session = await getSession();
  const cta = session ? "/dashboard" : "/signup";
  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 font-semibold text-lg"><BrandMark size={24} /> LensCRM</div>
        <nav className="flex items-center gap-2 text-sm">
          {session ? <Link href="/dashboard" className="btn btn-secondary">Studio</Link> : (<>
            <Link href="/login" className="hidden text-[var(--color-text-2)] hover:text-white sm:inline">Log in</Link>
            <Link href="/signup" className="btn btn-primary">{CTA_LABEL}</Link>
          </>)}
        </nav>
      </header>

      {/* 1 · HERO + the thread device */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 60% at 75% -10%, rgba(201,162,39,0.10), transparent 60%)" }} />
        <div className="grain" aria-hidden />
        <div className="relative mx-auto grid max-w-5xl items-center gap-10 px-5 pb-14 pt-10 sm:pt-16 lg:grid-cols-[1fr_380px]">
          <div>
            <p className="t-placard mb-4 text-[var(--color-brass)]">For wedding, portrait &amp; family photographers</p>
            <h1 className="t-display">Lead to gallery, one thread through the whole job.</h1>
            <p className="mt-5 max-w-[42ch] text-[17px] leading-relaxed text-[var(--color-text-2)]">
              Lead capture, booking, contracts, deposit-first invoicing, and client galleries — in one $24/mo tool.
              Stop re-typing a client&apos;s email into five apps. And we take <span className="text-[var(--color-text)]">no cut</span> of your payments — Stripe fees only.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href={cta} className="btn btn-primary btn-block sm:w-auto">{CTA_LABEL}</Link>
              <a href="#pricing" className="btn btn-secondary btn-block sm:w-auto">See the price math</a>
            </div>
            <p className="mt-3 text-xs text-[var(--color-text-3)]">No card. A booked wedding and a delivered gallery are waiting inside.</p>
          </div>
          <ThreadDevice />
        </div>
      </section>

      {/* 2 · THE MATH: consolidate, don't add */}
      <section id="pricing" className="paper-ground">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <p className="t-placard" style={{ color: "#6b6a63" }}>The math</p>
          <h2 className="t-display mt-2" style={{ fontSize: "clamp(28px, 5vw, 46px)", color: "#1b1b19" }}>A net saving, not a new expense.</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <div>
              {[
                ["HoneyBook (no galleries)", "$36+/mo"],
                ["+ Pixieset paid galleries", "$10–24/mo"],
                ["Your current stack", "$46–60/mo"],
                ["LensCRM Solo — all of it", "$24/mo"],
              ].map(([k, v], i) => (
                <div key={k} className="flex items-baseline justify-between gap-4 py-3.5" style={{ borderTop: `1px solid ${i === 3 ? "#1b1b19" : "#e2ded4"}`, borderBottom: i === 3 ? "1px solid #1b1b19" : undefined }}>
                  <span className={i === 3 ? "font-semibold" : "text-sm"} style={{ color: i === 3 ? "#1b1b19" : "#4a4842" }}>{k}</span>
                  <span className="mono text-[15px]" style={{ color: i === 3 ? "#1b1b19" : "#8a877d" }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="self-center">
              <p className="text-[15px] leading-relaxed" style={{ color: "#3a3833" }}>
                Photographers won&apos;t pay $80/mo for a CRM. They <em>will</em> pay $24 to cancel three subscriptions. Same workflow — booking, contracts, invoices, and galleries — for the price of the one tool that doesn&apos;t even do galleries.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3 · WHAT'S IN THE THREAD */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            { h: "Deposit-first booking", p: "The calendar hold, the contract, and the retainer invoice are one atomic flow. Booking confirms the moment the deposit clears — the #1 failure point in your current stack, fixed." },
            { h: "Shoot-type templates", p: "A wedding's 12-month arc, a newborn's 2-week window, a commercial job's usage-rights clause — pre-wired per shoot type, editable. The 'made for me' moment in your first trial session." },
            { h: "Galleries that sell you", p: "Password-protected, beautiful proofing galleries clients heart and download — integrated, not a second subscription. Good enough that clients ask who built it." },
          ].map((s, i) => (
            <div key={s.h}>
              <p className="mono text-[var(--color-brass)]">0{i + 1}</p>
              <h3 className="t-title mt-2 text-[17px]">{s.h}</h3>
              <p className="t-secondary mt-2 leading-relaxed">{s.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4 · PRICING */}
      <section className="border-y border-[var(--color-line)]">
        <div className="mx-auto max-w-5xl px-5 py-16">
          <h2 className="t-h2 sm:text-center">One price. Cancel the other four tabs.</h2>
          <p className="t-secondary mt-2 sm:text-center">14-day trial, no card. Annual = 10 months&apos; price. No cut of your client payments, on any tier.</p>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {(["solo", "studio", "pro"] as const).map((id) => {
              const p = PLANS[id];
              return (
                <div key={id} className={`placard p-5 ${id === "solo" ? "border-[var(--color-brass)]" : ""}`}>
                  <div className="flex items-baseline justify-between">
                    <h3 className="t-title">{p.name}{id === "solo" && <span className="pill pill-brass ml-2"><span className="dot" />Best value</span>}</h3>
                  </div>
                  <p className="invoice-total mt-2">${p.priceMonthly}<span className="text-base text-[var(--color-text-3)]" style={{ fontFamily: "var(--font-inter)" }}> /mo</span></p>
                  <ul className="mt-4 space-y-2">
                    {p.features.map((f) => (<li key={f} className="flex items-start gap-2 text-sm text-[var(--color-text-2)]"><IconCheck size={15} className="mt-0.5 text-[var(--color-fern)]" />{f}</li>))}
                  </ul>
                  <Link href={cta} className={`btn btn-block mt-5 ${id === "solo" ? "btn-primary" : "btn-secondary"}`}>{CTA_LABEL}</Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5 · FINAL */}
      <section className="relative overflow-hidden px-5 pb-20 pt-16 text-center sm:pt-24">
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% 120%, rgba(201,162,39,0.08), transparent 60%)" }} />
        <div className="grain" aria-hidden />
        <div className="relative">
          <h2 className="t-display" style={{ fontSize: "clamp(28px, 7vw, 48px)" }}>Run it like a prestige studio.</h2>
          <div className="mt-6"><Link href={cta} className="btn btn-primary">{CTA_LABEL}</Link></div>
          <p className="mt-3 text-xs text-[var(--color-text-3)]">14-day trial. No card. Cancel four subscriptions.</p>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl border-t border-[var(--color-line)] px-5 py-8 text-center text-xs text-[var(--color-text-3)]">
        LensCRM — built from the profitable-app-scaffolds portfolio.
      </footer>
      {!session && <StickyCTA href={cta} label={CTA_LABEL} />}
    </main>
  );
}
