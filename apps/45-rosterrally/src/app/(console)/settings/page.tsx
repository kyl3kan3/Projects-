import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import {
  ClubForm,
  InviteForm,
  LogoutForm,
  PlanForm,
  RoleForm,
  StripeForm,
} from "./SettingsForms";
import {
  inviteStaffAction,
  saveClubAction,
  saveStripeAccountAction,
  setRoleAction,
} from "./actions";
import { switchPlanAction } from "./actions";
import { logoutAction } from "../../(auth)/actions";
import { EmptyState, ScreenTitle, SectionHead } from "@/components/ui";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { recentActivity, describeAudit } from "@/lib/audit";
import { gatewayIsLive } from "@/lib/payments";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { club, user, settings } = await requireUser();

  if (!can(user.role, "manage_club")) {
    return (
      <main className="screen">
        <ScreenTitle eyebrow="Settings" title={club.name} />
        <EmptyState
          title="Club settings are admin-only"
          body={`Your role here is ${user.role}. A club admin can change the timezone, the plan and who is on the staff list.`}
        />
        <LogoutForm action={logoutAction} />
      </main>
    );
  }

  const staff = await getDb().select().from(users).where(eq(users.clubId, club.id));
  const activity = await recentActivity(club.id, 10);
  const live = gatewayIsLive();

  return (
    <main className="screen">
      <ScreenTitle eyebrow="Settings" title={club.name} />

      <ClubForm action={saveClubAction} club={club} settings={settings} />

      <SectionHead>What RosterRally costs this club</SectionHead>
      <div className="panel p-4">
        <p className="t-title">
          {club.plan === "flat" ? "Club flat — $49/mo" : "$1.50 per paid registration"}
        </p>
        <p className="t-secondary mt-2">
          {club.plan === "flat"
            ? "Unlimited registrations with no per-registration fee. Right for clubs running a lot of scholarship places."
            : "Charged only on registrations that actually collect money. Scholarship codes never carry it, and a refund gives it back."}
        </p>
        <div className="mt-4">
          <PlanForm action={switchPlanAction} plan={club.plan} />
        </div>
      </div>

      <SectionHead>Where the money lands</SectionHead>
      <p className="t-secondary">
        {live
          ? "Stripe is configured on this deployment."
          : "No Stripe key is set on this deployment, so checkout runs through the built-in test gateway. It exercises the same settlement path — cascade, receipts, waitlist promotion — but no card is charged."}
      </p>
      <div className="mt-3">
        <StripeForm action={saveStripeAccountAction} accountId={club.stripeAccountId} />
      </div>

      <SectionHead>Who is in the club</SectionHead>
      <div className="stagger">
        {staff.map((person) => (
          <div key={person.id} className="row">
            <span className="min-w-0 flex-1">
              <span className="t-title block truncate">{person.name}</span>
              <span className="t-secondary block truncate" style={{ color: "var(--fg-3)" }}>
                {person.email}
              </span>
            </span>
            <span className="t-data" style={{ color: "var(--fg-2)" }}>
              {person.role.toUpperCase()}
            </span>
            {person.id === user.id ? null : (
              <RoleForm action={setRoleAction} userId={person.id} role={person.role} />
            )}
          </div>
        ))}
      </div>
      <InviteForm action={inviteStaffAction} />
      <p className="t-secondary mt-3" style={{ color: "var(--fg-3)" }}>
        Seats are free and unlimited. Volunteer boards rotate, and a club that loses its registrar
        should not also lose its records.
      </p>

      <SectionHead>Recent activity</SectionHead>
      {activity.length === 0 ? (
        <p className="t-secondary py-2">Nothing recorded yet.</p>
      ) : (
        <div>
          {activity.map((row) => (
            <div key={row.id} className="row">
              <span className="t-secondary flex-1">{describeAudit(row)}</span>
              <span className="t-data" style={{ color: "var(--fg-3)" }}>
                {row.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </span>
            </div>
          ))}
        </div>
      )}

      <SectionHead>This deployment</SectionHead>
      <div className="row">
        <span className="t-secondary flex-1">Public base URL</span>
        <span className="t-data">{env.appUrl}</span>
      </div>
      <div className="row">
        <span className="t-secondary flex-1">Outbound email and SMS</span>
        <span className="t-data" style={{ color: env.dryRun ? "var(--warn)" : "var(--accent)" }}>
          {env.dryRun ? "DRY RUN — logged, not sent" : "LIVE"}
        </span>
      </div>
      <div className="row">
        <span className="t-secondary flex-1">Our per-registration fee</span>
        <span className="t-data">{(env.applicationFeeCents / 100).toFixed(2)}</span>
      </div>

      <LogoutForm action={logoutAction} />
    </main>
  );
}
