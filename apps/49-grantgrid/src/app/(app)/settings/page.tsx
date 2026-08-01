import type { Metadata } from "next";
import Link from "next/link";
import { requireUser, orgUsers } from "@/lib/auth";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconChevronRight } from "@/components/icons";
import { entitlement, effectivePlan } from "@/lib/billing";
import { plan, isUnlimited } from "@/lib/plans";
import { normalizeOffsets } from "@/lib/reminders";
import { grantCount } from "@/lib/grants";
import { profileCompleteness } from "@/lib/fit-score";
import { IcsFeedPanel, RemindersForm } from "./SettingsForms";
import { signOutAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { org, user, role } = await requireUser();
  const ent = entitlement(org);
  const activePlan = effectivePlan(org);
  const spec = plan(activePlan);
  const count = await grantCount(org.id);
  const team = await orgUsers(org.id);
  const completeness = profileCompleteness({
    mission: org.profile.mission,
    serviceStates: org.profile.serviceStates,
    causeCodes: org.profile.causeCodes,
    typicalAskCents: org.profile.typicalAskCents,
    budgetBand: org.profile.budgetBand,
  });

  return (
    <div className="screen">
      <ScreenHeader title="Settings" summary={`${org.name.toUpperCase()} · ${spec.name.toUpperCase()}`} />

      <section className="pt-6">
        <Link href="/settings/profile" className="row">
          <span className="min-w-0 flex-1">
            <span className="t-title block">Organization profile</span>
            <span className="t-secondary block">
              {completeness.scorable
                ? "Complete — discovery is scoring against it"
                : `Needs ${completeness.missing.join(", ")}`}
            </span>
          </span>
          <IconChevronRight size={18} style={{ color: "var(--color-ink-2)" }} />
        </Link>
        <Link href="/settings/billing" className="row">
          <span className="min-w-0 flex-1">
            <span className="t-title block">Plan and billing</span>
            <span className="t-secondary block">
              {spec.name}
              {ent.state === "trialing" && ent.trialDaysLeft !== null
                ? ` · trial, ${ent.trialDaysLeft} ${ent.trialDaysLeft === 1 ? "day" : "days"} left`
                : ent.state === "trial_expired"
                  ? " · trial ended"
                  : ""}
              {isUnlimited(spec.trackedGrants)
                ? " · unlimited tracked grants"
                : ` · ${count} of ${spec.trackedGrants} tracked grants`}
            </span>
          </span>
          <IconChevronRight size={18} style={{ color: "var(--color-ink-2)" }} />
        </Link>
      </section>

      <section className="pt-8">
        <h2 className="t-label">Deadlines and reminders</h2>
        <div className="pt-4">
          <RemindersForm
            timezone={org.timezone}
            offsets={normalizeOffsets(org.reminderOffsets)}
          />
        </div>
      </section>

      <section className="pt-8">
        <h2 className="t-label">Calendar subscription</h2>
        <div className="pt-4">
          <IcsFeedPanel hasToken={Boolean(org.icsTokenHash)} />
        </div>
      </section>

      <section className="pt-8">
        <h2 className="t-label">Who is on this account</h2>
        <div className="pt-2">
          {team.map((member) => (
            <div key={member.id} className="row" style={{ cursor: "default" }}>
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate">
                  {member.name?.trim() || member.email.split("@")[0]}
                </span>
                <span className="t-secondary block truncate">{member.email}</span>
              </span>
              <span className="t-label shrink-0">
                {member.id === user.id ? role : "member"}
              </span>
            </div>
          ))}
        </div>
        <p className="t-secondary mt-3" style={{ color: "var(--color-ink-2)" }}>
          Report and renewal last calls go to everyone here, not only whoever owns the
          row — a late report is how a renewal quietly disappears. {spec.name} includes{" "}
          {spec.users} users; inviting teammates is not in this build.
        </p>
      </section>

      <section className="pt-8">
        <h2 className="t-label">Session</h2>
        <form action={signOutAction} className="pt-4">
          <button className="btn btn-secondary w-full lg:w-auto" type="submit">
            Sign out
          </button>
        </form>
      </section>

      <p className="t-secondary rule-t mt-8 pt-4" style={{ color: "var(--color-ink-2)" }}>
        Signed in as {user.email}. Dates are read in {org.timezone}.
      </p>
    </div>
  );
}
