import type { Metadata } from "next";
import Link from "next/link";
import { defaultBrand, reminderRuleFor, requireUser } from "@/lib/auth";
import { documentsCreatedThisMonth } from "@/lib/documents";
import { documentQuota, plan } from "@/lib/plans";
import { logoutAction } from "../../(auth)/actions";
import { BrandForm, ReminderForm } from "./SettingsForms";
import { saveBrandAction, saveRemindersAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const brand = await defaultBrand(user.id);
  const rule = await reminderRuleFor(user.id);
  const limits = plan(user.plan);
  const quota = documentQuota(user.plan, await documentsCreatedThisMonth(user.id));

  return (
    <main className="screen pt-6">
      <h1 className="t-h2">Settings</h1>
      <p className="t-secondary mt-1">{user.email}</p>

      <section className="hairline-b mt-6 pb-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="t-label">Plan</h2>
            <p className="t-title mt-1">{limits.name}</p>
          </div>
          <Link href="/settings/billing" className="btn-quiet">
            {user.plan === "free" ? "See Solo" : "Billing"}
          </Link>
        </div>
        <p className="t-secondary mt-2">
          {quota.limit === Infinity
            ? "Unlimited documents, deposits on signature, automatic reminders."
            : `${quota.used} of ${quota.limit} documents used this month. Contracts and invoices the chain creates don't count against it.`}
        </p>
      </section>

      <section className="hairline-b py-6">
        <h2 className="t-label mb-4">Brand</h2>
        <BrandForm
          brand={brand}
          canBrand={limits.customBranding}
          canSenderDomain={limits.senderDomain}
          action={saveBrandAction}
        />
      </section>

      <section className="hairline-b py-6">
        <h2 className="t-label mb-4">Late-payment reminders</h2>
        <ReminderForm rule={rule} canAuto={limits.autoReminders} action={saveRemindersAction} />
      </section>

      <section className="py-6">
        <h2 className="t-label">About the contract template</h2>
        <p className="t-secondary mt-2 max-w-[46ch]">
          PaperTrail's clauses are written to be readable and fair, and they cover the things
          freelancers actually get burned on: deposit, ownership on payment, late payment, and
          cancellation. They are a starting point, not legal advice — for work in a regulated field,
          or above the size where you would want a lawyer anyway, have one read it.
        </p>
      </section>

      <form action={logoutAction} className="pb-6">
        <button className="btn btn-secondary btn-full" type="submit">
          Sign out
        </button>
      </form>
    </main>
  );
}
