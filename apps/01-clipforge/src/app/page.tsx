import Link from "next/link";
import { getSession } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { StickyCTA } from "@/components/StickyCTA";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = await getSession();
  const cta = session ? "/dashboard" : "/signup";
  const ctaLabel = session ? "Go to dashboard" : "Start free — 2 uploads";

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-[var(--color-brand-2)] to-[var(--color-brand)]" />
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
          <span className="bg-gradient-to-r from-[var(--color-brand-2)] to-[var(--color-accent)] bg-clip-text text-transparent">
            A week of content out.
          </span>
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

      {/* Proof: a stacked content kit (phone-native) */}
      <section className="mx-auto max-w-md px-5 py-8 sm:max-w-3xl">
        <div className="grid gap-4">
          {/* clip proof — shows the film-develop signature */}
          <div className="card overflow-hidden p-0">
            <div className="relative aspect-[9/16] max-h-[420px] w-full bg-gradient-to-br from-[#1a2234] to-[#0f1422]">
              <div className="develop-in absolute inset-0 flex items-end p-4">
                <div className="w-full space-y-1.5">
                  <div className="h-2.5 w-3/5 rounded bg-[var(--color-accent)]/80" />
                  <div className="h-2 w-2/5 rounded bg-[var(--color-brand-2)]/70" />
                </div>
              </div>
              <span className="badge absolute right-3 top-3">9:16 · captioned</span>
            </div>
          </div>
          {/* thread proof */}
          <div className="card p-4">
            <div className="mb-2 text-xs font-semibold text-[var(--color-muted)]">Tweet thread</div>
            <div className="space-y-2">
              <div className="rounded-lg bg-[var(--color-panel-2)] p-3 text-sm">
                <span className="mono mr-2 text-[var(--color-muted)]">1/6</span>
                Most creators publish an episode and let 80% of its value die in 48 hours. Here's the fix 🧵
              </div>
              <div className="rounded-lg bg-[var(--color-panel-2)] p-3 text-sm">
                <span className="mono mr-2 text-[var(--color-muted)]">2/6</span>
                Start with the hook, not the highlight. The first two seconds decide everything.
              </div>
            </div>
          </div>
          {/* newsletter proof */}
          <div className="card p-4">
            <div className="mb-2 text-xs font-semibold text-[var(--color-muted)]">Newsletter</div>
            <p className="text-sm text-[#dfe5f3]">
              <strong>The 80% you're leaving on the table.</strong> Every episode has a
              handful of moments that stand on their own. Most never get cut…
            </p>
            <p className="cite mt-2 text-xs text-[var(--color-muted)]">
              <span className="mono text-[var(--color-accent)]">4:12</span> “we left 80% of the value on the table”
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-5xl px-5 py-10">
        <h2 className="t-h2 mb-6 font-display font-bold sm:text-center">Simple, upload-based pricing</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {(["starter", "pro", "team"] as const).map((id) => {
            const p = PLANS[id];
            return (
              <div key={id} className={`card p-6 ${id === "pro" ? "ring-2 ring-[var(--color-brand)]" : ""}`}>
                {id === "pro" && <div className="badge mb-3">Most popular</div>}
                <h3 className="font-display text-xl font-bold">{p.name}</h3>
                <p className="font-display mt-1 text-4xl font-extrabold">
                  ${p.priceMonthly}
                  <span className="text-base font-normal text-[var(--color-muted)]">/mo</span>
                </p>
                <ul className="mt-4 space-y-2 text-sm text-[var(--color-muted)]">
                  <li>{p.uploadsPerPeriod} uploads / month</li>
                  <li>{p.maxExportHeight}p export · 9:16 + 1:1</li>
                  <li>{p.brandPresets ? "Brand presets" : "Standard captions"}</li>
                  <li>{p.seats} seat{p.seats > 1 ? "s" : ""}</li>
                  {p.apiAccess && <li>API access</li>}
                </ul>
                <Link href={cta} className="btn btn-primary btn-block mt-6">Choose {p.name}</Link>
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
