import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { hasRole, requireUser, roleLabel } from "@/lib/auth";
import { DetailRow, ScreenHeader } from "@/components/ui";
import { visitValueCentsFor, windowDaysFor } from "@/lib/attribution";
import { money } from "@/lib/format";
import { monthlyCents, planName, trialDaysLeft } from "@/lib/plans";
import { senderMode } from "@/server/notify";
import {
  AddLocationForm,
  InviteForm,
  LocationForm,
  PracticeForm,
  SignOutForm,
  SwitchLocationForm,
} from "./SettingsForms";
import {
  addLocationAction,
  inviteUserAction,
  switchLocationAction,
  updateLocationAction,
  updatePracticeAction,
} from "./actions";
import { signOutAction } from "../../(auth)/actions";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireUser();
  const canManage = hasRole(ctx.user, "office_manager");
  const isOwner = hasRole(ctx.user, "owner");
  const sender = senderMode();

  const staff = await getDb()
    .select()
    .from(users)
    .where(eq(users.practiceId, ctx.practice.id))
    .orderBy(asc(users.createdAt));

  return (
    <main className="screen">
      <ScreenHeader label={ctx.practice.name} title="Settings" action={<SignOutForm action={signOutAction} />} />

      <section>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Plan
        </p>
        <DetailRow term="Plan">{planName(ctx.practice.plan)}</DetailRow>
        <DetailRow term="Locations">{ctx.locations.length}</DetailRow>
        <DetailRow term="Monthly">
          {money(monthlyCents(ctx.practice.plan, ctx.locations.length))}
        </DetailRow>
        <DetailRow term="Trial">
          {ctx.practice.stripeSubscriptionId
            ? (ctx.practice.subscriptionStatus ?? "active")
            : `${trialDaysLeft(ctx.practice.trialEndsAt)} days left`}
        </DetailRow>
        <DetailRow term="Sending">{sender.email === "live" ? "live" : "rehearsal"}</DetailRow>
        <p style={{ marginTop: 12 }}>
          <Link href="/settings/billing" className="btn-quiet">
            Billing and plans
          </Link>
        </p>
      </section>

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 16 }}>
        <p className="t-label" style={{ margin: "0 0 12px" }}>
          The two numbers everything else rests on
        </p>
        <PracticeForm
          action={updatePracticeAction}
          practiceName={ctx.practice.name}
          visitValueCents={visitValueCentsFor(ctx.practice.settings)}
          attributionWindowDays={windowDaysFor(ctx.practice.settings)}
          canEdit={canManage}
        />
      </section>

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 16 }}>
        <p className="t-label" style={{ margin: "0 0 12px" }}>
          This location
        </p>
        <LocationForm action={updateLocationAction} location={ctx.location} canEdit={canManage} />
      </section>

      {ctx.locations.length > 1 && (
        <section className="hairline-t" style={{ marginTop: 24, paddingTop: 16 }}>
          <SwitchLocationForm
            action={switchLocationAction}
            locations={ctx.locations.map((l) => ({ id: l.id, name: l.name }))}
            currentId={ctx.location.id}
          />
        </section>
      )}

      {isOwner && (
        <section className="hairline-t" style={{ marginTop: 24, paddingTop: 16 }}>
          <p className="t-label" style={{ margin: "0 0 12px" }}>
            Add a location
          </p>
          <AddLocationForm action={addLocationAction} />
        </section>
      )}

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 16 }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          People
        </p>
        {staff.map((person) => (
          <DetailRow key={person.id} term={person.name}>
            {roleLabel(person.role)}
          </DetailRow>
        ))}
        {isOwner && (
          <div style={{ marginTop: 16 }}>
            <InviteForm action={inviteUserAction} />
          </div>
        )}
      </section>

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 16 }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Roster
        </p>
        <p className="t-secondary" style={{ marginTop: 0 }}>
          Re-import whenever your PMS list changes. Committed imports can be rolled back in one action,
          and an import never undoes a patient&rsquo;s opt-out.
        </p>
        <Link href="/imports" className="btn btn-secondary">
          Imports
        </Link>
      </section>
    </main>
  );
}
