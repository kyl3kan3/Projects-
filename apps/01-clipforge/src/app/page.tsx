import Link from "next/link";
import { getSession } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { StickyCTA } from "@/components/StickyCTA";
import { BrandMark } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = await getSession();
  const cta = session ? "/dashboard" : "/signup";
  const ctaLabel = session ? "Go to dashboard" : "Start free — 2 uploads";

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 font-display text-lg font-bold">
          <BrandMark size={24} />
          ClipForge
        </div>
        <nav className="flex items-center gap-2 text-sm">
          {session ? (
            <Link href="/dashboard" className="btn btn-ghost">Dashboard</Link>
          ) : (
            <>
              <Link href="/login" className="hidden text-[var(--color-muted)] hover:text-white sm:inline">Log in</Link>
              <Link href="/signup" className="btn btn-primary">Start free</Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero — single column on phone */}
      <section className="mx-auto max-w-5xl px-5 pt-8 pb-6 sm:pt-14 sm:text-center">
        <div className="badge mb-5">AI content repurposing studio</div>
        <h1 className="t-hero font-display font-bold">
          One upload in.
          <br />
          <span className="text-[var(--color-brand)]">A week of content out.</span>
        </h1>
        <p className="t-lead mx-auto mt-5 max-w-2xl text-[var(--color-muted)]">
          Drop in a podcast or long-form video — or paste a YouTube link. ClipForge
          finds the best moments, cuts captioned 9:16 and 1:1 clips, and writes the
          tweet thread, LinkedIn posts, and newsletter — every asset grounded in
          what was actually said.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href={cta} className="btn btn-primary btn-block sm:w-auto">{ctaLabel}</Link>
          <a href="#pricing" className="btn btn-ghost btn-block sm:w-auto">See pricing</a>
        </div>
        <p className="mt-3 text-center text-xs text-[var(--color-muted)] sm:text-center">
          No card for the trial. The output is the demo.
        </p>
      </section>

      {/* Proof: a stacked content kit with real content (no wireframe bars) */}
      <section className="mx-auto max-w-md px-5 py-8 sm:max-w-3xl">
        <div className="t-label mb-4">One episode becomes</div>
        <div className="grid gap-4">
          {/* clip proof — art-directed still + real caption type + develop reveal */}
          <div className="card overflow-hidden p-0">
            <div className="relative aspect-[9/16] max-h-[420px] w-full overflow-hidden">
              <div className="develop-in absolute inset-0">
                {/* duotone "video still": violet-on-ink radial scene */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(80% 55% at 50% 28%, rgba(122,108,255,0.32), transparent 70%), radial-gradient(60% 40% at 30% 75%, rgba(122,108,255,0.12), transparent 70%), #12151C",
                  }}
                />
                {/* silhouette of a speaker */}
                <div
                  className="absolute bottom-0 left-1/2 h-3/5 w-3/4 -translate-x-1/2"
                  style={{
                    background: "radial-gradient(50% 60% at 50% 20%, #262b38 0 38%, transparent 40%), radial-gradient(85% 70% at 50% 95%, #20242f 0 60%, transparent 62%)",
                  }}
                />
                {/* real caption type — the actual product output */}
                <div className="absolute inset-x-0 bottom-0 p-5 text-center">
                  <p className="font-display text-2xl font-semibold uppercase leading-tight">
                    You don't need
                    <br />
                    <span className="text-[var(--color-brand)]">more content.</span>
                  </p>
                  <p className="mono mt-2 text-xs text-[var(--color-muted)]">0:00–0:34</p>
                </div>
              </div>
              <span className="badge absolute right-3 top-3">9:16 · Captioned</span>
            </div>
          </div>
          {/* thread proof */}
          <div className="card p-4">
            <div className="t-label mb-3">Tweet thread</div>
            <div className="space-y-2">
              <div className="rounded-[10px] bg-[var(--color-panel-2)] p-3 text-sm leading-relaxed">
                <span className="mono mr-2 text-[var(--color-faint)]">1/6</span>
                Most creators publish an episode and let 80% of its value die in 48 hours. Here's the system that fixes it.
              </div>
              <div className="rounded-[10px] bg-[var(--color-panel-2)] p-3 text-sm leading-relaxed">
                <span className="mono mr-2 text-[var(--color-faint)]">2/6</span>
                Start with the hook, not the highlight. The first two seconds decide everything.
              </div>
            </div>
          </div>
          {/* newsletter proof */}
          <div className="card p-4">
            <div className="t-label mb-3">Newsletter</div>
            <p className="text-sm leading-relaxed text-[var(--color-text)]">
              <strong>The 80% you're leaving on the table.</strong> Every episode has a
              handful of moments that stand on their own. Most never get cut…
            </p>
            <p className="mt-3 text-xs text-[var(--color-muted)]">
              <span className="mono text-[var(--color-brand)]">4:12</span>{" "}
              “we left 80% of the value on the table”
            </p>
          </div>
        </div>
      </section>

      {/* Pricing — hairline-divided blocks, not boxes */}
      <section id="pricing" className="mx-auto max-w-5xl px-5 py-10">
        <h2 className="t-h2 mb-2 font-display sm:text-center">Simple, upload-based pricing</h2>
        <p className="t-secondary mb-6 sm:text-center">Priced on uploads — the honest cost driver.</p>
        <div className="rowlist sm:grid sm:grid-cols-3 sm:gap-8 sm:border-t sm:border-[var(--color-line)] sm:pt-8 sm:[&>*+*]:border-t-0">
          {(["starter", "pro", "team"] as const).map((id) => {
            const p = PLANS[id];
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
                  <li>{p.uploadsPerPeriod} uploads / month</li>
                  <li>{p.maxExportHeight}p export · 9:16 + 1:1</li>
                  <li>{p.brandPresets ? "Brand presets" : "Standard captions"}</li>
                  <li>{p.seats} seat{p.seats > 1 ? "s" : ""}{p.apiAccess ? " · API access" : ""}</li>
                </ul>
                <Link href={cta} className={`btn btn-block mt-5 ${id === "pro" ? "btn-primary" : "btn-ghost"}`}>
                  Choose {p.name}
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-5 py-10 text-center text-xs text-[var(--color-muted)]">
        ClipForge — built from the profitable-app-scaffolds portfolio.
      </footer>

      {!session && <StickyCTA href={cta} label={ctaLabel} />}
    </main>
  );
}
