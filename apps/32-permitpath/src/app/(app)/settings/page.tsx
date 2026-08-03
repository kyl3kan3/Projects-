import type { Metadata } from "next";
import Link from "next/link";
import { IconChevronRight, IconStamp } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { entitlement, trialDaysLeft } from "@/lib/billing";
import { listOrgContributions } from "@/lib/contributions";
import { longDate, money, shortDate } from "@/lib/format";
import { countActiveJobs, listOrgMembers } from "@/lib/jobs";
import { countWatches } from "@/lib/jurisdictions";
import { checkActiveJobs, checkUsers, checkWatches, planSpec } from "@/lib/plans";
import { jobTypeLabel } from "@/lib/taxonomy";
import { signOutAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, org } = await requireUser();
  const [members, activeJobs, watches, contributions] = await Promise.all([
    listOrgMembers(org.id),
    countActiveJobs(org.id),
    countWatches(org.id),
    listOrgContributions(org.id, 8),
  ]);

  const plan = planSpec(org.plan);
  const state = entitlement(org);
  const daysLeft = trialDaysLeft(org);
  const usage = [
    { label: "Users", check: checkUsers(org.plan, members.length) },
    { label: "Active jobs", check: checkActiveJobs(org.plan, activeJobs) },
    { label: "Jurisdictions watched", check: checkWatches(org.plan, watches) },
  ];

  return (
    <main className="screen pt-6">
      <h1 className="t-h2">{org.name}</h1>
      <p className="t-secondary mt-2">
        {plan.name} plan · {org.planInterval === "year" ? "billed annually" : "billed monthly"} ·{" "}
        {state === "trialing" && daysLeft !== null
          ? `trial, ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`
          : state === "active"
            ? "active"
            : state === "past_due"
              ? "payment retrying"
              : "no active subscription"}
      </p>

      <section className="mt-6">
        <h2 className="t-label">Usage against your plan</h2>
        <ul className="mt-1">
          {usage.map((row) => (
            <li key={row.label} className="row">
              <span className="min-w-0 flex-1">
                <span className="t-title block">{row.label}</span>
                {row.check.message && <span className="t-secondary block">{row.check.message}</span>}
              </span>
              <span
                className="t-data shrink-0"
                style={{ color: row.check.allowed ? "var(--color-fg-3)" : "var(--color-ochre)" }}
              >
                {row.check.used} / {row.check.limit === null ? "unlimited" : row.check.limit}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="t-label">Team</h2>
        <ul className="mt-1">
          {members.map((member) => (
            <li key={member.id} className="row">
              <span className="min-w-0 flex-1">
                <span className="t-title block">{member.name}</span>
                <span className="t-secondary block truncate">{member.email}</span>
              </span>
              <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
                {member.id === user.id ? "you" : "member"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="t-label">Contribution credit</h2>
        <p className="t-body mt-2">
          <span className="t-mono">{money(org.contributionCreditCents)}</span> earned from accepted
          edits. $10 per accepted correction, capped at half an invoice.
        </p>
        {contributions.length > 0 && (
          <ul className="mt-2">
            {contributions.map((entry) => (
              <li key={entry.contribution.id} className="row">
                <span className="min-w-0 flex-1">
                  <span className="t-title block">
                    {entry.jurisdictionName} — {jobTypeLabel(entry.jobType)}
                  </span>
                  <span className="t-secondary block">
                    {entry.contribution.reviewState === "pending"
                      ? "In moderation"
                      : entry.contribution.reviewState === "accepted"
                        ? `Accepted ${entry.contribution.reviewedAt ? longDate(entry.contribution.reviewedAt) : ""}`
                        : `Not accepted — ${entry.contribution.rejectionReason ?? "no reason recorded"}`}
                  </span>
                </span>
                <span
                  className="t-data shrink-0"
                  style={{
                    color:
                      entry.contribution.reviewState === "accepted"
                        ? "var(--color-brick)"
                        : "var(--color-fg-3)",
                  }}
                >
                  {entry.contribution.creditCentsAwarded
                    ? money(entry.contribution.creditCentsAwarded)
                    : shortDate(entry.contribution.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <Link href="/settings/billing" className="row row-tap" style={{ color: "inherit" }}>
          <span className="min-w-0 flex-1">
            <span className="t-title block">Plan and billing</span>
            <span className="t-secondary block">Change plan, switch to annual, manage the card</span>
          </span>
          <IconChevronRight size={18} style={{ color: "var(--color-fg-3)" }} />
        </Link>

        {user.isCurator && (
          <Link href="/admin" className="row row-tap" style={{ color: "inherit" }}>
            <span className="min-w-0 flex-1">
              <span className="t-title block">Curation console</span>
              <span className="t-secondary block">
                Review queue, record editor, contribution moderation
              </span>
            </span>
            <IconStamp size={18} className="stamp-glyph" />
          </Link>
        )}
      </section>

      <section className="mt-8">
        <p className="t-secondary">
          PermitPath is a research aid, not a code authority. Every record shows when it was last
          verified and by whom — check the source before you submit, and tell us when a counter says
          otherwise.
        </p>
      </section>

      <form action={signOutAction} className="mt-6">
        <button type="submit" className="btn btn-secondary btn-full">
          Sign out
        </button>
      </form>
    </main>
  );
}
