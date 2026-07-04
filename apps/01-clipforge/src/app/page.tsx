import Link from "next/link";
import { getSession } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { StickyCTA } from "@/components/StickyCTA";
import { BrandMark } from "@/components/icons";
import { HeroDemo } from "@/components/marketing/HeroDemo";
import { Multiplier } from "@/components/marketing/Multiplier";
import { ContactSheet } from "@/components/marketing/ContactSheet";
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

      {/* ============ 1 · HERO: darkroom, giant editorial type ============ */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(120% 60% at 70% -10%, rgba(232,163,61,0.22), transparent 62%)" }}
        />
        <span className="wm" style={{ top: 8, right: -26, fontSize: "clamp(200px, 34vw, 420px)" }} aria-hidden>
          14
        </span>
        <div className="noise" aria-hidden />
        <div className="relative mx-auto grid max-w-5xl items-center gap-10 px-5 pb-10 pt-12 sm:pt-20 lg:grid-cols-[1fr_420px]">
          <div>
            <p className="mono text-xs tracking-[0.14em] text-[var(--color-brand)]">EP 42 · 62:14 · ONE UPLOAD</p>
            <h1 className="t-hero-xl mt-4">
              Publish
              <br />
              once.
              <br />
              <span className="outl-v">Post all</span>
              <br />
              <span className="outl-v">week.</span>
            </h1>
            <p className="t-lead mt-5 max-w-[34ch] text-[var(--color-muted)]">
              Your episode already contains a week of content. ClipForge
              develops it — clips, thread, posts, newsletter — while your
              coffee&apos;s still hot.
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

      {/* ============ 2 · THE CONTACT SHEET: tonight's negatives ============ */}
      <section className="pt-10 sm:pt-16">
        <ContactSheet />
      </section>

      {/* ============ 3 · THE DEVICE: 1 → 14 ============ */}
      <section className="relative mx-auto max-w-5xl overflow-hidden px-5 py-20 sm:py-28">
        <span
          className="wm left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-60"
          style={{ fontSize: "clamp(220px, 40vw, 460px)" }}
          aria-hidden
        >
          14
        </span>
        <div className="relative">
          <Multiplier />
        </div>
      </section>

      {/* ============ 4 · THE MATH — inverted to paper ============ */}
      <section className="paperband relative z-[3]">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-14 sm:grid-cols-2 sm:py-20">
          <div>
            <p className="t-label">The math</p>
            <h2
              className="font-display mt-2 uppercase"
              style={{ fontSize: "clamp(34px, 6vw, 56px)", lineHeight: 1.02, letterSpacing: "-0.02em" }}
            >
              The Sunday
              <br />
              you keep losing.
            </h2>
            <p className="mt-4 max-w-[44ch] text-[#4A5160]">
              Scrub 62 minutes for the good moments, cut them vertical, caption
              them, rewrite the ideas three ways. Done properly, that&apos;s an
              afternoon. Done by an agency, it&apos;s a retainer. So it just…
              doesn&apos;t happen — and the episode dies in 48 hours.
            </p>
          </div>
          <div className="self-center">
            {[
              ["Doing it yourself", "4–8 hrs / episode"],
              ["Hiring a VA", "$600+ / month"],
              ["An agency", "$1,500+ / month"],
              ["ClipForge", "12 min · $29 / mo"],
            ].map(([who, cost], i) => (
              <div
                key={who}
                className="flex items-baseline justify-between gap-4 py-3.5"
                style={{
                  borderTop: `1px solid ${i === 3 ? "#0B0D12" : "#D9DCE4"}`,
                  borderBottom: i === 3 ? "1px solid #0B0D12" : undefined,
                }}
              >
                <span className={i === 3 ? "font-display text-base" : "text-sm text-[#4A5160]"}>{who}</span>
                <span className={`mono text-[15px] ${i === 3 ? "text-[var(--color-ink)]" : "text-[#8A90A0]"}`}>
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
                        "radial-gradient(80% 55% at 50% 28%, rgba(232,163,61,0.30), transparent 70%), #12151C",
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
                      You don&apos;t need
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
                48 hours. Here&apos;s the system that fixes it.
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
                <strong>The 80% you&apos;re leaving on the table.</strong> Every
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

      {/* ============ 6 · OBJECTION: the citation, oversized ============ */}
      <section className="relative overflow-hidden border-y border-[var(--color-line)] py-16 sm:py-20">
        <span className="wm -top-10 left-0 opacity-50" style={{ fontSize: "clamp(160px, 24vw, 300px)" }} aria-hidden>
          &ldquo;
        </span>
        <div className="relative mx-auto max-w-2xl px-5 text-center">
          <p className="mono text-2xl tracking-wide text-[var(--color-brand)]">[31:02]</p>
          <p className="font-display mx-auto mt-4 max-w-[24ch] text-2xl leading-snug sm:text-3xl">
            &ldquo;distribution isn&apos;t a second project — it&apos;s the same project, finished&rdquo;
          </p>
          <p className="mx-auto mt-5 max-w-[52ch] text-sm text-[var(--color-muted)]">
            Every line ClipForge writes carries a citation — the verbatim quote
            and its timestamp. If it wasn&apos;t said, it isn&apos;t written. Your voice,
            your claims, receipts attached.
          </p>
        </div>
      </section>

      {/* ============ 7 · PRICING — paper again ============ */}
      <section id="pricing" className="paperband">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <p className="t-label">Pricing</p>
          <h2
            className="font-display mt-2 uppercase"
            style={{ fontSize: "clamp(30px, 5vw, 48px)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
          >
            Cheaper than the VA.
          </h2>
          <p className="mt-2 text-sm text-[#4A5160]">
            Priced on uploads — the honest cost driver. Pro works out to{" "}
            <span className="mono text-[var(--color-ink)]">28¢ per asset</span>.
          </p>
          <div className="mt-8 sm:grid sm:grid-cols-3 sm:gap-8">
            {(["starter", "pro", "team"] as const).map((id) => {
              const p = PLANS[id];
              const perAsset = Math.round((p.priceMonthly / (p.uploadsPerPeriod * 14)) * 100);
              return (
                <div
                  key={id}
                  className="py-6"
                  style={{ borderTop: `1px solid ${id === "pro" ? "#0B0D12" : "#D9DCE4"}` }}
                >
                  <div className="flex items-baseline justify-between sm:block">
                    <h3 className="font-display text-lg">
                      {p.name}
                      {id === "pro" && (
                        <span className="badge ml-2 border-[#D9DCE4] text-[var(--color-brand)]">Popular</span>
                      )}
                    </h3>
                    <p className="font-display text-4xl sm:mt-2">
                      ${p.priceMonthly}
                      <span className="text-base font-normal text-[#8A90A0]"> /mo</span>
                    </p>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm text-[#4A5160]">
                    <li>
                      {p.uploadsPerPeriod} uploads → {p.uploadsPerPeriod * 14} assets{" "}
                      <span className="mono text-[#8A90A0]">({perAsset}¢ each)</span>
                    </li>
                    <li>{p.maxExportHeight}p export · 9:16 + 1:1</li>
                    <li>{p.brandPresets ? "Brand presets" : "Standard captions"}</li>
                    <li>
                      {p.seats} seat{p.seats > 1 ? "s" : ""}
                      {p.apiAccess ? " · API access" : ""}
                    </li>
                  </ul>
                  <Link
                    href={cta}
                    className={`btn btn-block mt-5 ${id === "pro" ? "btn-ink" : "border border-[#C9CDD8] text-[var(--color-ink)]"}`}
                  >
                    Choose {p.name}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ 8 · FINAL CTA ============ */}
      <section className="relative overflow-hidden px-5 pb-20 pt-16 text-center sm:pt-24">
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(120% 80% at 50% 120%, rgba(232,163,61,0.18), transparent 60%)" }}
        />
        <div className="noise" aria-hidden />
        <div className="relative">
          <h2 className="t-hero-xl" style={{ fontSize: "clamp(40px, 9vw, 96px)" }}>
            Your next
            <br />
            episode
            <br />
            <span className="outl-v">deserves</span>
            <br />
            <span className="outl-v">a week.</span>
          </h2>
          <div className="mt-8">
            <Link href={cta} className="btn btn-primary">{CTA_LABEL}</Link>
          </div>
          <p className="mt-3 text-xs text-[var(--color-faint)]">Two uploads free. No card. Cancel in one click.</p>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl border-t border-[var(--color-line)] px-5 py-8 text-center text-xs text-[var(--color-faint)]">
        ClipForge — built from the profitable-app-scaffolds portfolio.
      </footer>

      {!session && <StickyCTA href={cta} label={CTA_LABEL} />}
    </main>
  );
}
