import type { Metadata } from "next";
import { LinkRow, ScreenTitle, SectionHead } from "@/components/ui";
import { requireSchool, roleLabel } from "@/lib/auth";
import { recentAudit } from "@/lib/audit";
import { redisStatus } from "@/lib/lock";
import { PLANS, trialState } from "@/lib/plans";
import { formatDate } from "@/lib/time";
import { SchoolForm } from "./SchoolForm";
import { LogoutButton } from "./LogoutButton";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { school, user } = await requireSchool();
  const [audit, redis] = await Promise.all([recentAudit(school.id, 12), redisStatus()]);
  const trial = trialState(school.trialEndsAt);

  return (
    <main className="screen">
      <ScreenTitle eyebrow={roleLabel(user.role)} title="Settings" />

      <SectionHead>Everything else</SectionHead>
      <div>
        <LinkRow href="/curriculum" title="Programs and curriculum" secondary="Rank ladders and their requirements" />
        <LinkRow href="/schedule" title="Class schedule" secondary="The weekly classes check-ins attach to" />
        <LinkRow href="/announce" title="Announcements" secondary="Email the school, with delivery status" />
        <LinkRow href="/settings/kiosk" title="Kiosk devices" secondary="Mint and revoke door tablets" />
        <LinkRow href="/settings/staff" title="Staff accounts" secondary="Owner, instructor, front desk" />
        <LinkRow
          href="/settings/plan"
          title="MatPass plan"
          secondary={
            school.billingStatus === "trialing" && trial.trialing
              ? `${PLANS[school.plan].name} trial · ${trial.daysLeft} days left`
              : `${PLANS[school.plan].name} · ${school.billingStatus}`
          }
        />
        <LinkRow href="/roster/export" title="Export the roster" secondary="CSV of students, ranks and progress" />
      </div>

      <SectionHead>School</SectionHead>
      <SchoolForm
        name={school.name}
        timezone={school.timezone}
        canEdit={user.role === "owner"}
        retentionBaselineFraction={school.settings.retentionBaselineFraction ?? 0.4}
        retentionMinDaysAbsent={school.settings.retentionMinDaysAbsent ?? 10}
        kioskPinEnabled={school.settings.kioskPinEnabled ?? true}
      />

      <SectionHead>Background work</SectionHead>
      <p className="t-secondary">
        The nightly sweep refreshes eligibility snapshots, runs the retention scan and sends dunning
        notices. In production it is a cron-triggered route protected by <span className="t-data">CRON_SECRET</span>;
        in development <span className="t-data">npm run worker</span> runs the same code in a loop.
      </p>
      <p className="t-secondary fg-3" style={{ marginTop: 8 }}>
        Redis:{" "}
        {redis.configured
          ? redis.reachable
            ? "reachable — sweeps take a lock so nothing is emailed twice"
            : "configured but unreachable; sweeps run unlocked"
          : "not configured; sweeps run unlocked (fine for a single process)"}
      </p>

      <SectionHead>Recent activity</SectionHead>
      {audit.length === 0 ? (
        <p className="t-secondary fg-3">Nothing logged yet.</p>
      ) : (
        <div>
          {audit.map((entry) => (
            <div key={entry.id} className="row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="t-secondary fg">{entry.action.replace(/[._]/g, " ")}</p>
                <p className="t-data fg-3" style={{ marginTop: 2 }}>
                  {formatDate(entry.occurredAt, school.timezone)}
                  {entry.actorName ? ` · ${entry.actorName}` : " · system"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionHead>Signed in as</SectionHead>
      <p className="t-body">{user.name}</p>
      <p className="t-secondary fg-3" style={{ marginTop: 2 }}>
        {user.email} · {roleLabel(user.role)}
      </p>
      <div style={{ marginTop: 16 }}>
        <LogoutButton />
      </div>
    </main>
  );
}
