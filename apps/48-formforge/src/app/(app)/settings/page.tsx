import type { Metadata } from "next";
import Link from "next/link";
import { requireUser, roleLabel } from "@/lib/auth";
import { clinicianCount, settingsOf } from "@/lib/practices";
import { PLANS, planDefinition, priceLabel, sendGate } from "@/lib/plans";
import { AGREEMENT_VERSION, SUBPROCESSORS, agreementState } from "@/lib/agreement";
import { recentExports } from "@/lib/exports";
import { stampLocal, bytesLabel } from "@/lib/format";
import { emailConfigured, s3Configured, smsConfigured, stripeConfigured } from "@/lib/env";
import { SettingsForm } from "./SettingsForm";
import { LogoutButton } from "./LogoutButton";
import { IconCheck, IconShieldCheck } from "@/components/icons";

export const metadata: Metadata = { title: "Settings" };

/**
 * Settings, and the "how your data is protected" page a practice can actually read.
 *
 * The integration list says plainly which services are configured on *this*
 * deployment, because "encryption is on" and "email is going nowhere because there
 * is no API key" are both facts an operator needs and neither is guessable from a
 * green checkmark.
 */
export default async function SettingsPage() {
  const { user, practice } = await requireUser();
  const settings = settingsOf(practice);
  const agreement = agreementState(practice);
  const clinicians = await clinicianCount(practice.id);
  const exportsList = await recentExports(practice.id, 8);
  const plan = planDefinition(practice.plan);
  const gate = sendGate({
    plan: practice.plan,
    clinicians,
    trialEndsAt: practice.trialEndsAt,
    subscriptionStatus: practice.subscriptionStatus,
  });

  return (
    <main className="screen pt-6">
      <h1 className="t-h2 mb-6">Settings</h1>

      {/* ---- plan ---- */}
      <section className="mb-10">
        <h2 className="t-label mb-2">Plan</h2>
        <p className="t-title">
          {plan.name} · {priceLabel(practice.plan)}
        </p>
        <p className="t-secondary mb-1">
          {clinicians} of {plan.clinicianCap} clinician{plan.clinicianCap === 1 ? "" : "s"} ·{" "}
          {gate.trialDaysLeft !== null && gate.trialDaysLeft > 0
            ? `${gate.trialDaysLeft} days left in trial`
            : practice.subscriptionStatus ?? "no subscription"}
        </p>
        {!gate.canSend && (
          <p className="t-secondary mb-2" style={{ color: "var(--color-clay)" }}>
            {gate.reason}
          </p>
        )}
        <Link href="/settings/billing" className="btn-quiet">
          Change plan
        </Link>
      </section>

      {/* ---- agreement ---- */}
      <section className="mb-10">
        <h2 className="t-label mb-2">Data protection</h2>
        <div className="panel p-4">
          <p className="t-title mb-1 flex items-center gap-2">
            <span style={{ color: agreement.accepted ? "var(--color-moss)" : "var(--color-ink-3)" }}>
              <IconShieldCheck size={18} />
            </span>
            Agreement ({AGREEMENT_VERSION})
          </p>
          {agreement.accepted ? (
            <p className="t-secondary">
              Read and accepted by {agreement.signerName} on{" "}
              {stampLocal(agreement.acceptedAt!, settings.timeZone)}
              {agreement.stale ? " — a newer version is available." : "."}
            </p>
          ) : (
            <p className="t-secondary">Not read yet.</p>
          )}
          <Link href="/settings/agreement" className="btn-quiet mt-2 inline-block">
            {agreement.accepted ? "Read it again" : "Read the agreement"}
          </Link>
        </div>

        <h3 className="t-label mb-2 mt-6">Subprocessors</h3>
        <ul className="list-none p-0">
          {SUBPROCESSORS.map((s) => (
            <li key={s.name} className="hairline-b py-3">
              <p className="t-title">{s.name}</p>
              <p className="t-secondary">{s.role}</p>
              <p className="t-data mt-1" style={{ color: "var(--color-ink-3)" }}>
                {s.status.toUpperCase()}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- what is switched on here ---- */}
      <section className="mb-10">
        <h2 className="t-label mb-2">This deployment</h2>
        <ul className="list-none p-0">
          <Capability
            label="Field-level encryption"
            on
            detail="AES-256-GCM under a per-practice data key, wrapped by the master key."
          />
          <Capability
            label="Append-only audit log"
            on
            detail="Database triggers refuse UPDATE, DELETE and TRUNCATE."
          />
          <Capability
            label="Email delivery"
            on={emailConfigured()}
            detail={
              emailConfigured()
                ? "Resend is configured. Messages carry a first name, your practice name and the link."
                : "No email provider configured — invites and reminders are logged, not sent."
            }
          />
          <Capability
            label="SMS delivery"
            on={smsConfigured()}
            detail={
              smsConfigured()
                ? "Twilio is configured."
                : "No SMS provider configured — texts are logged, not sent."
            }
          />
          <Capability
            label="Object storage for uploads"
            on={s3Configured()}
            detail={
              s3Configured()
                ? "Encrypted files go to S3 with SSE-KMS on top."
                : "Uploads are stored as encrypted bytes in Postgres. Nothing is unprotected; it just does not scale as far."
            }
          />
          <Capability
            label="Billing"
            on={stripeConfigured()}
            detail={
              stripeConfigured() ? "Stripe is configured." : "No Stripe key — the plan list is read-only."
            }
          />
        </ul>
      </section>

      {/* ---- reminders, retention ---- */}
      <section className="mb-10">
        <h2 className="t-label mb-2">Reminders and retention</h2>
        {user.role === "owner" ? (
          <SettingsForm settings={settings} />
        ) : (
          <p className="t-secondary">
            Only an owner can change retention and quiet hours. You are signed in as{" "}
            {roleLabel(user.role)}.
          </p>
        )}
      </section>

      {/* ---- exports ---- */}
      <section className="mb-10">
        <h2 className="t-label mb-2">Recent exports</h2>
        {exportsList.length === 0 ? (
          <p className="t-secondary">Nothing exported yet.</p>
        ) : (
          <ul className="list-none p-0">
            {exportsList.map((row) => (
              <li key={row.id} className="ledger-row">
                <span>{stampLocal(row.createdAt, settings.timeZone)}</span>
                <span className="ledger-verb">{row.kind.toUpperCase()}</span>
                <span className="min-w-0 break-all">{row.filename}</span>
                <span style={{ color: "var(--color-ink-3)" }}>{bytesLabel(row.byteSize)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <LogoutButton />
    </main>
  );
}

function Capability({ label, on, detail }: { label: string; on: boolean; detail: string }) {
  return (
    <li className="hairline-b py-3">
      <p className="t-title flex items-center gap-2">
        <span style={{ color: on ? "var(--color-moss)" : "var(--color-ink-3)" }}>
          <IconCheck size={18} />
        </span>
        {label}
      </p>
      <p className="t-secondary mt-1">{detail}</p>
    </li>
  );
}
