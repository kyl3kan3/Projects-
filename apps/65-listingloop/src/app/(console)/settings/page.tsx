import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { holidays } from "@/db/schema";
import { requireSession, roleLabel } from "@/lib/auth";
import { formatLong, todayInZone } from "@/lib/dates";
import { emailConfigured, env, r2Configured, stripeConfigured } from "@/lib/env";
import { isReadOnly, planSpec, trialDaysLeft } from "@/lib/plans";
import { readAlwaysNotifyCoordinator, readOffsets } from "@/lib/reminder-rules";
import { hasQueue } from "@/lib/runtime";
import { storageMode } from "@/lib/storage";
import { DeskSettingsForm, RunRemindersForm } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, account } = await requireSession();
  const today = todayInZone(account.timezone);
  const offsets = readOffsets(account.settings);
  const spec = planSpec(account.plan);

  const upcomingHolidays = await getDb()
    .select({ date: holidays.date, label: holidays.label, scope: holidays.scope })
    .from(holidays)
    .where(inArray(holidays.scope, ["us", account.state.toUpperCase()]))
    .orderBy(holidays.date);
  const next = upcomingHolidays.filter((h) => h.date >= today).slice(0, 6);
  const loaded = upcomingHolidays.length;

  return (
    <main className="mx-auto max-w-4xl px-5 pb-24 pt-6 lg:pb-10">
      <h1 className="t-display">Settings.</h1>

      <section className="mt-8" aria-labelledby="desk-heading">
        <h2 id="desk-heading" className="t-h2">
          The desk
        </h2>
        <div className="mt-4">
          <DeskSettingsForm
            name={account.name}
            state={account.state}
            timezone={account.timezone}
            offsets={offsets}
            alwaysNotifyCoordinator={readAlwaysNotifyCoordinator(account.settings)}
            readOnly={isReadOnly(account)}
          />
        </div>
      </section>

      <section className="mt-12" aria-labelledby="plan-heading">
        <h2 id="plan-heading" className="t-h2">
          Plan
        </h2>
        <p className="t-body mt-2">
          {spec.name}
          {account.plan === "trial" ? ` — ${trialDaysLeft(account)} days left` : ""} ·{" "}
          {spec.activeDeals === Number.POSITIVE_INFINITY
            ? "unlimited active files"
            : `${spec.activeDeals} active files`}
        </p>
        <Link href="/settings/billing" className="btn btn-secondary mt-3">
          Billing and plans
        </Link>
      </section>

      <section className="mt-12" aria-labelledby="reminders-heading">
        <h2 id="reminders-heading" className="t-h2">
          Reminders
        </h2>
        <p className="t-body mt-2 text-dim">
          The nightly pass runs from{" "}
          {hasQueue()
            ? "the worker's repeatable job at 13:00 UTC"
            : "/api/cron/tick, which the platform's scheduler calls once a day"}
          . Every party gets at most one email per pass, however many of their dates landed on the
          same rung.
        </p>
        <RunRemindersForm dryRun={env.dryRun || !emailConfigured()} />
      </section>

      <section className="mt-12" aria-labelledby="calendar-heading">
        <h2 id="calendar-heading" className="t-h2">
          Holiday calendar
        </h2>
        <p className="t-body mt-2 text-dim">
          {loaded} rows loaded for US federal + {account.state}. A holiday moves a business-day
          deadline by a working day and a calendar deadline off the closure — which is the
          arithmetic nobody does correctly in their head.
        </p>
        {next.length > 0 ? (
          <ul className="mt-3 list-none p-0">
            {next.map((h) => (
              <li key={`${h.scope}-${h.date}`} className="hairline-b flex items-baseline justify-between gap-4 py-2">
                <span className="t-body">{h.label}</span>
                <span className="t-mono">
                  {formatLong(h.date)}
                  {h.scope !== "us" ? ` · ${h.scope}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-secondary mt-3">
            No rows ahead of today. Run <span className="t-mono">npm run db:seed</span> to load the
            calendar.
          </p>
        )}
      </section>

      <section className="mt-12" aria-labelledby="you-heading">
        <h2 id="you-heading" className="t-h2">
          You
        </h2>
        <dl className="mt-3">
          <div className="hairline-b flex items-baseline justify-between gap-4 py-2">
            <dt className="t-secondary">Name</dt>
            <dd className="t-body">{user.name}</dd>
          </div>
          <div className="hairline-b flex items-baseline justify-between gap-4 py-2">
            <dt className="t-secondary">Email</dt>
            <dd className="t-body">{user.email}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2">
            <dt className="t-secondary">Role</dt>
            <dd className="t-body">{roleLabel(user.role)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-12" aria-labelledby="deployment-heading">
        <h2 id="deployment-heading" className="t-h2">
          This deployment
        </h2>
        <p className="t-secondary mt-1">
          What is wired up, stated plainly rather than failing quietly later.
        </p>
        <dl className="mt-3">
          <Row
            label="Email"
            value={
              emailConfigured()
                ? "Resend — reminders are sent"
                : env.dryRun
                  ? "DRY_RUN — reminders are recorded and logged, not sent"
                  : "No RESEND_API_KEY — reminders are recorded and logged, not sent"
            }
          />
          <Row
            label="Documents"
            value={
              r2Configured()
                ? `Cloudflare R2 — bucket ${env.r2Bucket}`
                : `Postgres (${storageMode()}) — uploads are stored in the database`
            }
          />
          <Row
            label="Queue"
            value={
              hasQueue()
                ? "Redis — npm run worker drains the four jobs"
                : "None — /api/cron/tick does the nightly work, recomputes run inline"
            }
          />
          <Row
            label="Billing"
            value={stripeConfigured() ? "Stripe checkout and portal are live" : "No Stripe keys — the billing screen lists plans without a checkout"}
          />
        </dl>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="hairline-b flex flex-wrap items-baseline justify-between gap-4 py-2">
      <dt className="t-secondary">{label}</dt>
      <dd className="t-body text-right">{value}</dd>
    </div>
  );
}
