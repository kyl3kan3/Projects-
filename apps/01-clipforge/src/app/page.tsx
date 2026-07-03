import Link from "next/link";
import { getSession } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { StickyCTA } from "@/components/StickyCTA";
import { BrandMark } from "@/components/icons";
import { HeroDemo } from "@/components/marketing/HeroDemo";
import { Multiplier } from "@/components/marketing/Multiplier";
import { Reveal } from "@/components/motion/Reveal";

export const dynamic = "force-dynamic";

// One CTA phrase, repeated verbatim (MARKETING_PLAYBOOK law 7).
const CTA_LABEL = "Get your first kit free";

export default async function LandingPage() {
  const session = await getSession();
  const cta = session ? "/dashboard" : "/signup";

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 font-display text-lg">
          <BrandMark size={24} />
          ClipForge
        </div>
        <nav className="flex items-center gap-2 text-sm">
          {session ? (
            <Link href="/dashboard" className="btn btn-ghost">Dashboard</Link>
          ) : (
            <>
              <Link href="/login" className="hidden text-[var(--color-muted)] hover:text-white sm:inline">Log in</Link>
              <Link href="/signup" className="btn btn-primary">{CTA_LABEL}</Link>
            </>
          )}
        </nav>
      </header>

      {/* ============ 1 · HERO: the claim + the machine running ============ */}
      <section className="mx-auto max-w-5xl px-5 pt-8 sm:pt-14">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_420px]">
          <div>
            <p className="t-label mb-4">For podcasters &amp; long-form creators</p>
            <h1 className="t-hero font-display">
              Publish once.
              <br />
              <span className="text-[var(--color-brand)]">Post all week.</span>
            </h1>
            <p className="t-lead mt-5 max-w-[38ch] text-[var(--color-muted)]">
              Your episode already contains a week of content. ClipForge gets it
              out — clips, thread, posts, newsletter — in the time it takes to
              pour a coffee.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href={cta} className="btn btn-primary btn-block sm:w-auto">{CTA_LABEL}</Link>
              <a href="#kit" className="btn btn-ghost btn-block sm:w-auto">Watch a kit get made</a>
            </div>
            <p className="mt-3 text-xs text-[var(--color-faint)]">
              No card. Two free uploads. The output is the demo.
            </p>
          </div>
          <div id="kit">
            <HeroDemo />
          </div>
        </div>
      </section>

      {/* ============ 2 · THE DEVICE: 1 → 14 ============ */}
      <section className="mx-auto max-w-5xl px-5 py-20 sm:py-28">
        <Multiplier />
      </section>

      {/* ============ 3 · THE MATH: the enemy, quantified ============ */}
      <section className="mx-auto max-w-5xl border-y border-[var(--color-line)] px-5 py-14">
        <div className="grid gap-10 sm:grid-cols-2">
          <div>
            <h2 className="t-h2 font-display">The Sunday you keep losing</h2>
            <p className="mt-4 max-w-[44ch] text-[var(--color-muted)]">
              Repurposing one episode by hand: scrub 62 minutes for the good
              moments, cut them vertical, caption them, rewrite the ideas three
              ways. Done properly, that's an afternoon. Done by an agency,
              it's a retainer. So for most creators it just… doesn't happen —
              and the episode dies in 48 hours.
            </p>
          </div>
          <div className="rowlist self-center">
            {[
              ["Doing it yourself", "4–8 hours / episode"],
              ["Hiring a VA", "$600+ / month"],
              ["An agency", "$1,500+ / month"],
              ["ClipForge", "12 minutes, $29 / month"],
            ].map(([who, cost], i) => (
              <div key={who} className="flex items-baseline justify-between gap-4 py-3.5">
                <span className={i === 3 ? "t-title" : "text-sm text-[var(--color-muted)]"}>{who}</span>
                <span className={`mono text-[15px] ${i === 3 ? "text-[var(--color-paper)]" : "text-[var(--color-faint)]"}`}>
                  {cost}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 4 · RECEIPTS: an honest kit, shown ============ */}
      <section className="mx-auto max-w-md px-5 py-16 sm:max-w-3xl">
        <Reveal>
          <p className="t-label">Receipts</p>
          <h2 className="t-h2 font-display mt-2">
            From our own 62-minute episode
          </h2>
          <p className="mt-2 max-w-[48ch] text-sm text-[var(--color-muted)]">
            Not a mockup — the actual kit ClipForge produced from episode 42 of
            our build log. Timestamped, transcript-cited, unedited.
          </p>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {/* clip artifact with the develop signature */}
          <Reveal className="sm:row-span-2">
            <div className="card overflow-hidden">
              <div className="relative overflow-hidden" style={{ aspectRatio: "9/16", maxHeight: 460 }}>
                <div className="develop-in absolute inset-0">
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(80% 55% at 50% 28%, rgba(122,108,255,0.30), transparent 70%), #12151C",
                    }}
                  />
                  <div
                    className="absolute bottom-0 left-1/2 h-3/5 w-3/4 -translate-x-1/2"
                    style={{
                      background:
                        "radial-gradient(50% 60% at 50% 20%, #262b38 0 38%, transparent 40%), radial-gradient(85% 70% at 50% 95%, #20242f 0 60%, transparent 62%)",
                    }}
                  />
                  <div className="absolute inset-x-0 bottom-0 p-6 text-center">
                    <p className="font-display text-2xl uppercase leading-tight">
                      You don't need
                      <br />
                      <span className="text-[var(--color-brand)]">more content.</span>
                    </p>
                    <p className="mono mt-2 text-xs text-[var(--color-faint)]">0:00–0:34 · HOOK 94</p>
                  </div>
                </div>
                <span className="develop-edge" />
                <span className="badge absolute right-3 top-3" style={{ background: "rgba(11,13,18,0.7)" }}>
                  Clip 1 of 10
                </span>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.06}>
            <div className="card p-4">
              <div className="t-label mb-3">Thread · 6 tweets</div>
              <div className="well p-3 text-sm leading-relaxed">
                <span className="mono mr-2 text-[var(--color-faint)]">1/6</span>
                Most creators publish an episode and let 80% of its value die in
                48 hours. Here's the system that fixes it.
              </div>
              <p className="mt-3 text-xs text-[var(--color-muted)]">
                <span className="mono text-[var(--color-brand)]">4:12</span>{" "}
                “we left 80% of the value on the table”
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="card p-4">
              <div className="t-label mb-3">Newsletter · 412 words</div>
              <p className="text-sm leading-relaxed">
                <strong>The 80% you're leaving on the table.</strong> Every
                episode has a handful of moments that stand on their own. Most
                never get cut…
              </p>
              <p className="mt-3 text-xs text-[var(--color-muted)]">
                <span className="mono text-[var(--color-brand)]">18:39</span>{" "}
                “start with the hook, not the highlight”
              </p>
            </div>
          </Reveal>
        </div>
        <div className="mt-8 text-center">
          <Link href={cta} className="btn btn-primary">{CTA_LABEL}</Link>
        </div>
      </section>

      {/* ============ 5 · OBJECTION KILLER ============ */}
      <section className="mx-auto max-w-5xl border-y border-[var(--color-line)] px-5 py-14">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="t-h2 font-display">Every word traceable to the tape.</h2>
          <p className="mx-auto mt-4 max-w-[52ch] text-[var(--color-muted)]">
            The reason AI repurposing feels like spam is that it invents. ClipForge
            doesn't. Every thread, post, and newsletter line carries a citation —
            the verbatim quote and its timestamp. If it wasn't said, it isn't
            written. Your voice, your claims, receipts attached.
          </p>
          <div className="well mx-auto mt-6 inline-block px-4 py-3 text-left text-sm">
            <span className="mono text-[var(--color-brand)]">[31:02]</span>{" "}
            “distribution isn't a second project — it's the same project, finished”
          </div>
        </div>
      </section>

      {/* ============ 6 · PRICING, anchored ============ */}
      <section id="pricing" className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="t-h2 font-display sm:text-center">
          Cheaper than the VA you were about to hire
        </h2>
        <p className="t-secondary mt-2 sm:text-center">
          Priced on uploads — the honest cost driver. Pro works out to{" "}
          <span className="mono text-[var(--color-paper)]">28¢ per asset</span>.
        </p>
        <div className="rowlist mt-8 sm:grid sm:grid-cols-3 sm:gap-8 sm:border-t sm:border-[var(--color-line)] sm:pt-8 sm:[&>*+*]:border-t-0">
          {(["starter", "pro", "team"] as const).map((id) => {
            const p = PLANS[id];
            const perAsset = Math.round((p.priceMonthly / (p.uploadsPerPeriod * 14)) * 100);
            return (
              <div key={id} className="py-6 sm:py-0">
                <div className="flex items-baseline justify-between sm:block">
                  <h3 className="t-title font-display text-lg">
                    {p.name}
                    {id === "pro" && <span className="badge ml-2 text-[var(--color-brand)]">Popular</span>}
                  </h3>
                  <p className="font-display text-4xl text-[var(--color-paper)] sm:mt-2">
                    ${p.priceMonthly}
                    <span className="text-base font-normal text-[var(--color-faint)]"> /mo</span>
                  </p>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-[var(--color-muted)]">
                  <li>
                    {p.uploadsPerPeriod} uploads → {p.uploadsPerPeriod * 14} assets{" "}
                    <span className="mono text-[var(--color-faint)]">({perAsset}¢ each)</span>
                  </li>
                  <li>{p.maxExportHeight}p export · 9:16 + 1:1</li>
                  <li>{p.brandPresets ? "Brand presets" : "Standard captions"}</li>
                  <li>
                    {p.seats} seat{p.seats > 1 ? "s" : ""}
                    {p.apiAccess ? " · API access" : ""}
                  </li>
                </ul>
                <Link href={cta} className={`btn btn-block mt-5 ${id === "pro" ? "btn-primary" : "btn-ghost"}`}>
                  Choose {p.name}
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============ 7 · FINAL CTA ============ */}
      <section className="mx-auto max-w-5xl px-5 pb-20 pt-4 text-center">
        <h2 className="t-hero font-display" style={{ fontSize: "clamp(28px, 7vw, 48px)" }}>
          Your next episode deserves a week.
        </h2>
        <div className="mt-6">
          <Link href={cta} className="btn btn-primary">{CTA_LABEL}</Link>
        </div>
        <p className="mt-3 text-xs text-[var(--color-faint)]">Two uploads free. No card. Cancel in one click.</p>
      </section>

      <footer className="mx-auto max-w-5xl border-t border-[var(--color-line)] px-5 py-8 text-center text-xs text-[var(--color-faint)]">
        ClipForge — built from the profitable-app-scaffolds portfolio.
      </footer>

      {!session && <StickyCTA href={cta} label={CTA_LABEL} />}
    </main>
  );
}
