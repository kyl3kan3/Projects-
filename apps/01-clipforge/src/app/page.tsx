import Link from "next/link";
import { getSession } from "@/lib/auth";
import { PLANS } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = await getSession();
  const cta = session ? "/dashboard" : "/signup";

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-lg font-bold">
          <span className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-[var(--color-brand-2)] to-[var(--color-brand)]" />
          ClipForge
        </div>
        <nav className="flex items-center gap-3 text-sm">
          {session ? (
            <Link href="/dashboard" className="btn btn-ghost">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-[var(--color-muted)] hover:text-white">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Start free
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 pt-16 pb-10 text-center">
        <div className="badge mx-auto mb-6">AI content repurposing studio</div>
        <h1 className="text-balance text-5xl font-extrabold leading-tight sm:text-6xl">
          One upload in.
          <br />
          <span className="bg-gradient-to-r from-[var(--color-brand-2)] to-[var(--color-accent)] bg-clip-text text-transparent">
            A week of content out.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--color-muted)]">
          Drop in a podcast or long-form video. ClipForge finds the best moments,
          cuts captioned vertical clips, and writes the tweet thread, LinkedIn
          posts, and newsletter draft — every asset grounded in what was actually
          said.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href={cta} className="btn btn-primary text-base">
            {session ? "Go to dashboard" : "Start free — 2 uploads"}
          </Link>
          <a href="#pricing" className="btn btn-ghost text-base">
            See pricing
          </a>
        </div>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          No card for the trial. The output is the demo.
        </p>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 py-10 sm:grid-cols-3">
        {[
          {
            t: "Clips that hook",
            d: "5–10 standalone moments scored for hook strength and self-containment, cut to 9:16 with burned-in animated captions.",
          },
          {
            t: "Copy that isn't slop",
            d: "Threads, LinkedIn posts, and a newsletter draft — every claim backed by a real transcript quote with a timestamp.",
          },
          {
            t: "The whole workflow",
            d: "Not clips-only or text-only. One upload yields the clip and the thread and the newsletter, in one place.",
          },
        ].map((f) => (
          <div key={f.t} className="card p-5">
            <h3 className="font-semibold">{f.t}</h3>
            <p className="mt-2 text-sm text-[var(--color-muted)]">{f.d}</p>
          </div>
        ))}
      </section>

      <section id="pricing" className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="mb-8 text-center text-3xl font-bold">Simple, upload-based pricing</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {(["starter", "pro", "team"] as const).map((id) => {
            const p = PLANS[id];
            return (
              <div
                key={id}
                className={`card p-6 ${id === "pro" ? "ring-2 ring-[var(--color-brand)]" : ""}`}
              >
                {id === "pro" && <div className="badge mb-3">Most popular</div>}
                <h3 className="text-xl font-bold">{p.name}</h3>
                <p className="mt-1 text-3xl font-extrabold">
                  ${p.priceMonthly}
                  <span className="text-base font-normal text-[var(--color-muted)]">/mo</span>
                </p>
                <ul className="mt-4 space-y-2 text-sm text-[var(--color-muted)]">
                  <li>{p.uploadsPerPeriod} uploads / month</li>
                  <li>{p.maxExportHeight}p export</li>
                  <li>{p.brandPresets ? "Brand presets" : "Standard captions"}</li>
                  <li>
                    {p.seats} seat{p.seats > 1 ? "s" : ""}
                  </li>
                  {p.apiAccess && <li>API access</li>}
                </ul>
                <Link href={cta} className="btn btn-primary mt-6 w-full">
                  Choose {p.name}
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-center text-xs text-[var(--color-muted)]">
        ClipForge — built from the profitable-app-scaffolds portfolio.
      </footer>
    </main>
  );
}
