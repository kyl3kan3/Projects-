import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { creditBalance } from "@/lib/billing";
import { recentAudit } from "@/lib/audit";
import { PLANS, NO_ROLLOVER_NOTE } from "@/lib/plans";
import { LogoutButton } from "./LogoutButton";
import { IconChevronRight } from "@/components/icons";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, account } = await requireUser();
  const credits = await creditBalance(account.id);
  const plan = PLANS[account.plan];
  const audit = await recentAudit(account.id, 12);

  return (
    <main className="screen">
      <h1 className="t-h2 pt-8">Settings</h1>

      <section className="mt-6">
        <p className="t-label">Account</p>
        <dl className="mt-2">
          <div className="hairline-b flex items-baseline justify-between py-3">
            <dt className="t-secondary">Name</dt>
            <dd className="t-body">{user.name}</dd>
          </div>
          <div className="hairline-b flex items-baseline justify-between py-3">
            <dt className="t-secondary">Email</dt>
            <dd className="t-body">{user.email}</dd>
          </div>
          <div className="hairline-b flex items-baseline justify-between py-3">
            <dt className="t-secondary">Plan</dt>
            <dd className="t-body">{plan.name}</dd>
          </div>
          <div className="hairline-b flex items-baseline justify-between py-3">
            <dt className="t-secondary">Reviews left</dt>
            <dd className="t-data">{credits}</dd>
          </div>
        </dl>
        <Link href="/settings/billing" className="row no-underline" style={{ color: "inherit" }}>
          <span className="min-w-0 flex-1">
            <span className="t-title block">Billing and reviews</span>
            <span className="t-secondary block">
              {plan.monthlyCredits > 0 ? `${plan.monthlyCredits} a month · ${NO_ROLLOVER_NOTE}` : "Buy reviews one at a time, or subscribe"}
            </span>
          </span>
          <span style={{ color: "var(--color-text-3)" }}>
            <IconChevronRight size={20} />
          </span>
        </Link>
      </section>

      <section className="mt-8">
        <p className="t-label">What we do with your contracts</p>
        <ul className="mt-2" style={{ listStyle: "none", padding: 0 }}>
          <li className="hairline-b py-3">
            <p className="t-body">Deleted after {account.retentionDays} days</p>
            <p className="t-secondary">
              Each contract and its report are deleted automatically {account.retentionDays} days
              after upload. You can delete either sooner from its own page.
            </p>
          </li>
          <li className="hairline-b py-3">
            <p className="t-body">Never used to train a model</p>
            <p className="t-secondary">
              Your contracts are not used to train anything, by us or by our providers. The
              extraction call is a one-off request that returns typed JSON.
            </p>
          </li>
          <li className="hairline-b py-3">
            <p className="t-body">Not legal advice, and not a law firm</p>
            <p className="t-secondary">
              You acknowledged this at signup
              {account.disclaimerAckAt
                ? ` on ${account.disclaimerAckAt.toISOString().slice(0, 10)}`
                : ""}
              . Reports describe a document and flag what a careful reader would question.
              HIGH flags say plainly when a clause is worth a lawyer&rsquo;s hour.
            </p>
          </li>
        </ul>
      </section>

      {audit.length > 0 && (
        <section className="mt-8">
          <p className="t-label">Recent activity</p>
          <ul className="mt-2 scroll-x" style={{ listStyle: "none", padding: 0 }}>
            {audit.map((entry) => (
              <li key={entry.id} className="hairline-b flex flex-wrap items-baseline gap-2 py-2">
                <span className="t-data" style={{ color: "var(--color-text-3)" }}>
                  {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
                <span className="t-data" style={{ color: "var(--color-ink)" }}>
                  {entry.action.replace(/_/g, " ").toUpperCase()}
                </span>
                <span className="t-secondary" style={{ color: "var(--color-text-3)" }}>
                  {entry.actor}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10">
        <LogoutButton />
      </div>
    </main>
  );
}
