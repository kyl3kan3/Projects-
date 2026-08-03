import type { Metadata } from "next";
import Link from "next/link";
import { requirePractice } from "@/lib/auth";
import { billingFacts } from "@/lib/billing";
import { entitlement, meter } from "@/lib/plans";
import { currentPeriodUsage } from "@/lib/usage";
import { SettingsForm } from "./SettingsForm";
import { LogoutButton } from "./LogoutButton";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { practice, user } = await requirePractice();
  const now = new Date();
  const ent = entitlement(billingFacts(practice), now);
  const usage = await currentPeriodUsage(practice.id, practice.timezone, now);
  const m = meter(usage.notesDrafted, ent.noteLimit);

  return (
    <main className="screen pt-6">
      <h1 className="t-h2 mb-1">Settings</h1>
      <p className="t-secondary mb-6">
        {ent.plan.name} plan · {m.label}
        {ent.trialing ? ` · trial, ${ent.trialDaysLeft} days left` : ""} ·{" "}
        <Link className="btn-quiet btn-quiet-sm" href="/settings/billing">
          Billing
        </Link>
      </p>

      <SettingsForm
        name={user.name}
        credentials={user.credentials}
        signatureBlock={user.signatureBlock}
        defaultFormat={user.defaultFormat}
        practiceName={practice.name}
        timezone={practice.timezone}
        notifyOnDraftReady={practice.settings?.notifyOnDraftReady !== false}
      />

      <div className="mt-6">
        <LogoutButton />
      </div>
    </main>
  );
}
