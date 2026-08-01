import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "../../(auth)/actions";
import { formatIso } from "@/lib/dates";
import { can, featureAllowed, plan, planForFeature, ROLE_LABELS, unitUsage } from "@/lib/plans";
import { activeHouseholdCount } from "@/lib/roster";
import { storageName } from "@/lib/storage";
import { env } from "@/lib/env";
import { Notice, Pill } from "@/components/ledger";
import { IconChevronRight } from "@/components/icons";
import { OverflowLinks } from "@/components/TabBar";
import { AssociationForm, InviteForm, LadderForm, RoleForm } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, association, settings } = await requireUser();
  const canEdit = can(user.role, "settings");
  const board = await getDb().select().from(users).where(eq(users.associationId, association.id));
  const usage = unitUsage(association.plan, await activeHouseholdCount(association.id));

  return (
    <main className="screen">
      <header className="flex items-start justify-between gap-4 pt-8">
        <div>
          <p className="t-label">Settings</p>
          <h1 className="t-h2 mt-1">{association.name}</h1>
          <p className="t-secondary mt-1">
            {plan(association.plan).name} · {usage.used} of {usage.included} units · you are{" "}
            {ROLE_LABELS[user.role]}
          </p>
        </div>
        <OverflowLinks />
      </header>

      <nav className="chip-row mt-6">
        <Link href="/settings/payments" className="chip">
          Stripe for dues
        </Link>
        <Link href="/settings/billing" className="chip">
          DuesDesk plan
        </Link>
      </nav>

      {!canEdit ? (
        <section className="mt-6">
          <Notice>
            Your role is {ROLE_LABELS[user.role]}, which reads everything and changes nothing here.
            The president or treasurer can edit settings.
          </Notice>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="t-h2">The association</h2>
        <div className="panel mt-4 p-5">
          {canEdit ? (
            <AssociationForm
              name={association.name}
              timezone={association.timezone}
              invoiceFooter={settings.invoiceFooter}
              fiscalYearStartMonth={settings.fiscalYearStartMonth}
            />
          ) : (
            <>
              <Field label="Name">{association.name}</Field>
              <Field label="Time zone">{association.timezone}</Field>
              <Field label="Invoice note">{settings.invoiceFooter || "none"}</Field>
            </>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="t-h2">The board</h2>
        <p className="t-secondary mt-2">
          Turnover is the point: every officer&apos;s term is on the record, and a handover is a role
          change, not a migration.
        </p>
        <div className="mt-4">
          {board.map((member) => (
            <div key={member.id} className="hairline-b py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="t-title">
                    {member.name}
                    {member.id === user.id ? <span className="t-label ml-2">You</span> : null}
                  </p>
                  <p className="t-secondary">{member.email}</p>
                  {member.termNote ? (
                    <p className="t-data ink-3 mt-1">{member.termNote}</p>
                  ) : null}
                </div>
                <Pill tone={member.role === "member" ? "quiet" : "good"}>
                  {ROLE_LABELS[member.role]}
                </Pill>
              </div>
              {canEdit && member.id !== user.id ? (
                <div className="mt-2">
                  <RoleForm userId={member.id} current={member.role} name={member.name} />
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {canEdit ? (
          <div className="panel mt-4 p-5">
            <p className="t-label">Add a board member</p>
            <div className="mt-3">
              <InviteForm
                rolesAllowed={featureAllowed(association.plan, "boardRoles")}
                upgradeName={planForFeature("boardRoles").name}
              />
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="t-h2">Reminder ladder</h2>
        <p className="t-secondary mt-2">
          What a household hears, and when, after a due date passes. The copy is yours — write it the
          way your board would say it out loud.
        </p>
        <div className="panel mt-4 p-5">
          {canEdit ? (
            <LadderForm
              ladder={settings.reminderLadder}
              smsAllowed={featureAllowed(association.plan, "sms")}
              upgradeName={planForFeature("sms").name}
            />
          ) : (
            settings.reminderLadder.map((rung, index) => (
              <div key={index} className="hairline-b py-3 last:border-0">
                <p className="t-label">
                  Step {index + 1} · {rung.afterDays} days · {rung.channel}
                </p>
                <p className="t-title mt-1">{rung.subject}</p>
                <p className="t-secondary mt-1 whitespace-pre-wrap">{rung.body}</p>
              </div>
            ))
          )}
        </div>
        <div className="mt-4">
          <Notice>
            Nothing in DuesDesk escalates to legal language on its own. The 90-plus bucket offers an
            export you can hand to the association&apos;s attorney and stops there — collection
            process is governed by your state&apos;s statute and your own governing documents.
          </Notice>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="t-h2">This deployment</h2>
        <div className="panel mt-4 p-5">
          <Field label="Outbound email and SMS">
            {env.dryRun ? "dry run — logged, never delivered" : "live"}
          </Field>
          <Field label="Photo and document storage">
            {storageName() === "r2" ? "Cloudflare R2" : "local disk (no R2 credentials set)"}
          </Field>
          <Field label="Dues processing">
            {association.stripeAccountReady
              ? "the association's own Stripe account"
              : "not connected yet"}
          </Field>
          <p className="t-secondary mt-3">
            With dry run on you can rehearse a whole quarter against the real roster — invoices,
            reminders, announcements — without a single message leaving the building.
          </p>
        </div>
      </section>

      <section className="mt-10">
        <form action={logoutAction}>
          <button className="btn btn-secondary" type="submit">
            Sign out
          </button>
        </form>
        <p className="t-secondary mt-4">
          Signed in as {user.email}. Joined {formatIso(user.createdAt.toISOString().slice(0, 10))}.
        </p>
      </section>

      <section className="mt-10">
        <Link href="/settings/billing" className="row">
          <span className="flex-1">
            <span className="t-title">DuesDesk plan</span>
            <span className="t-secondary block">
              {plan(association.plan).name} · ${plan(association.plan).priceMonthly}/mo
            </span>
          </span>
          <IconChevronRight size={18} className="ink-3" />
        </Link>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="t-secondary">{label}</span>
      <span className="t-data text-right">{children}</span>
    </div>
  );
}
