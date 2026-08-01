import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { closedTradesFor, listAccounts, listTrades, tradesThisMonth } from "@/lib/trades";
import { plan } from "@/lib/plans";
import { formatCents } from "@/lib/money";
import { summarize } from "@/lib/analytics";
import { TimezoneForm } from "./TimezoneForm";
import { logoutAction } from "@/app/(auth)/actions";
import { IconArrowRight } from "@/components/icons";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const limits = plan(user.plan);
  const [accounts, all, closed, used] = await Promise.all([
    listAccounts(user.id),
    listTrades(user.id, { limit: 1_000 }),
    closedTradesFor(user.id),
    tradesThisMonth(user.id),
  ]);
  const summary = summarize(closed);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <h1 className="t-h2">Settings</h1>
        <p className="t-secondary mt-1 t-mono">{user.email}</p>
      </header>

      <section className="mb-8">
        <h2 className="t-label mb-3">Plan</h2>
        <p className="t-body">{limits.name}</p>
        <p className="t-secondary mt-1">{limits.pitch}</p>
        <p className="t-secondary mt-2">
          {accounts.length} of {limits.accounts}{" "}
          {limits.accounts === 1 ? "account" : "accounts"} ·{" "}
          {Number.isFinite(limits.tradesPerMonth)
            ? `${used} of ${limits.tradesPerMonth} trades this month`
            : "unlimited trades"}
        </p>
        <Link href="/settings/billing" className="btn-quiet mt-4 inline-flex items-center gap-2">
          Billing and plans
          <IconArrowRight size={16} />
        </Link>
      </section>

      <section className="mb-8">
        <h2 className="t-label mb-4">Your clock</h2>
        <TimezoneForm timezone={user.timezone} />
      </section>

      <section className="mb-8">
        <h2 className="t-label mb-3">Your data</h2>
        <ul>
          <li className="row">
            <span className="t-body flex-1">Trades</span>
            <span className="t-cell">{all.length}</span>
          </li>
          <li className="row">
            <span className="t-body flex-1">Closed</span>
            <span className="t-cell">{summary.closedCount}</span>
          </li>
          <li className="row">
            <span className="t-body flex-1">Net, all time</span>
            <span className="t-cell">{formatCents(summary.netCents, { signed: true })}</span>
          </li>
          <li className="row">
            <span className="t-body flex-1">Fees paid</span>
            <span className="t-cell">{formatCents(summary.feesCents)}</span>
          </li>
        </ul>
        <p className="t-secondary mt-4">
          Your P&amp;L is intimate data and TradeLog treats it that way: chart snapshots are served
          only to your own session, broker credentials are encrypted at rest, and none of it is sold
          or shared. Deleting an import removes its fills for good.
        </p>
      </section>

      <section>
        <h2 className="t-label mb-4">Session</h2>
        <form action={logoutAction}>
          <button className="btn btn-secondary" type="submit">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
