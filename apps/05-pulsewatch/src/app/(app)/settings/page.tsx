import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { countMonitors } from "@/lib/monitors";
import { plan } from "@/lib/plans";
import { IconBell, IconChevronRight } from "@/components/icons";
import { logoutAction } from "../../(auth)/actions";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, team } = await requireUser();
  const limits = plan(team.plan);
  const used = await countMonitors(team.id);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">Settings</p>
        <h1 className="t-h2 mt-2">{team.name}</h1>
        <p className="t-data mt-2" style={{ color: "var(--color-text-2)" }}>
          {user.email}
        </p>
      </header>

      <nav className="mb-8">
        <Link href="/settings/alerts" className="row">
          <IconBell size={20} />
          <span className="min-w-0 flex-1">
            <span className="t-title block">Alert channels</span>
            <span className="t-secondary">Where outages reach you</span>
          </span>
          <IconChevronRight size={18} />
        </Link>
        <Link href="/settings/billing" className="row">
          <span className="t-data w-5 text-center">$</span>
          <span className="min-w-0 flex-1">
            <span className="t-title block">Plan and billing</span>
            <span className="t-secondary">
              {limits.name} · {used} of {limits.monitors} monitors
            </span>
          </span>
          <IconChevronRight size={18} />
        </Link>
      </nav>

      <section className="mb-8">
        <p className="t-label mb-3">What your plan allows</p>
        <dl className="panel p-4">
          <Row label="Monitors" value={`${used} of ${limits.monitors}`} />
          <Row label="Check interval" value={`${limits.minIntervalSeconds / 60} min minimum`} />
          <Row label="Regions per check" value={String(limits.regionsPerCheck)} />
          <Row label="Status pages" value={String(limits.statusPages)} />
          <Row label="History" value={`${limits.retentionDays} days`} />
          <Row label="Channels" value={limits.channels.join(", ")} />
        </dl>
      </section>

      <section className="pb-8">
        <form action={logoutAction}>
          <button className="btn btn-secondary" type="submit">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="hairline-b flex items-baseline justify-between gap-4 py-2.5 last:border-0">
      <dt className="t-label">{label}</dt>
      <dd className="t-data text-right">{value}</dd>
    </div>
  );
}
