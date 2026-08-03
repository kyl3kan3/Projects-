import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { AUDIT_VERB, recentAudit } from "@/lib/audit";
import { emailConfigured, env, modelConfigured, r2Configured, stripeConfigured } from "@/lib/env";
import { formatStamp } from "@/lib/dates";
import { normaliseOffsets } from "@/lib/ladder";
import { planFor, priceLabel, trialState, vendorCap } from "@/lib/plans";
import { countVendors } from "@/lib/vendors";
import { storageBackend } from "@/lib/storage";
import { CopyField } from "@/components/CopyField";
import {
  LogoutButton,
  RotateHookKeyButton,
  RunTickButton,
  SettingsForm,
} from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };

/**
 * Settings, plus an honest statement of what is and is not wired up in this
 * deployment. A compliance tool that quietly is not sending email is worse than one
 * that says so.
 */
export default async function SettingsPage() {
  const { user, org } = await requireUser();
  const plan = planFor(org.plan);
  const trial = trialState(org);
  const cap = vendorCap(org.plan, await countVendors(org.id));
  const audit = await recentAudit(org.id, 25);
  const hookKey = org.settings?.hookKey ?? null;

  const wiring: Array<{ label: string; state: string; detail: string }> = [
    {
      label: "Certificate parsing",
      state: modelConfigured() ? "Claude" : "Local reader",
      detail: modelConfigured()
        ? `Forced ACORD extraction on ${env.parseModel}, with anything under ${env.reviewThreshold}% confidence sent to review.`
        : `No ANTHROPIC_API_KEY is set, so certificates are read by the built-in ACORD grammar. It handles text PDFs and reports its confidence honestly; a scan will fail rather than guess.`,
    },
    {
      label: "Certificate storage",
      state: storageBackend() === "r2" ? "Cloudflare R2" : "Postgres",
      detail:
        storageBackend() === "r2"
          ? "PDFs are stored in R2, content-addressed by sha256."
          : "No object store is configured, so PDFs are stored as bytes in Postgres. Nothing is lost either way.",
    },
    {
      label: "Chase email",
      state: emailConfigured() ? "Resend" : "Dry run",
      detail: emailConfigured()
        ? `Renewal requests and deficiency letters send from ${env.emailFrom}.`
        : "Chases are computed, recorded in the ledger, and logged instead of sent. Set RESEND_API_KEY and DRY_RUN=0 to send for real.",
    },
    {
      label: "Billing",
      state: stripeConfigured() ? "Stripe" : "Not configured",
      detail: stripeConfigured()
        ? "Checkout and the billing portal are live."
        : "No Stripe keys, so the billing screen lists the plans without a checkout button.",
    },
  ];

  return (
    <main style={{ padding: "24px var(--gutter) 0" }}>
      <h1 className="t-h2">Settings</h1>

      <section style={{ marginTop: 24 }}>
        <h2 className="t-label">Organisation</h2>
        <SettingsForm
          name={org.name}
          holderName={org.settings?.holderName ?? org.name}
          timezone={org.timezone}
          tone={org.settings?.tone === "firm" ? "firm" : "plain"}
          chaseOffsets={normaliseOffsets(org.settings?.chaseOffsets)}
        />
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 className="t-h2">Plan</h2>
        <p className="t-body" style={{ marginTop: 8 }}>
          {plan.name} · {priceLabel(plan)}
          {trial.onTrial
            ? trial.expired
              ? " · trial ended"
              : ` · ${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left`
            : ""}
        </p>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {cap.used} vendor{cap.used === 1 ? "" : "s"}
          {cap.limit != null ? ` of ${cap.limit}` : " (unlimited)"} ·{" "}
          {plan.hooks ? "compliance hook available" : "compliance hook on Portfolio and above"}
        </p>
        <Link href="/settings/billing" className="btn btn-secondary" style={{ marginTop: 12 }}>
          Plans and billing
        </Link>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 className="t-h2">Certificate intake address</h2>
        <p className="t-secondary" style={{ marginTop: 4, maxWidth: "62ch" }}>
          Agents email certificates to whatever address they always have. Forward that mailbox to your
          intake address, point its inbound webhook at the endpoint below, and each certificate lands
          in the review queue with the vendor matched by the sender.
        </p>
        <div style={{ marginTop: 12 }}>
          <CopyField
            value={`intake+${org.id}@${(env.emailFrom.match(/@([^>\s]+)/)?.[1] ?? "mail.certshield.app").replace(/>$/, "")}`}
            label="Your intake address"
          />
          <div style={{ marginTop: 12 }}>
            <CopyField value={`${env.appUrl}/api/inbound/certificate`} label="Inbound webhook" />
          </div>
        </div>
        <p className="field-help">
          The tag in the address is what identifies your company — one insurance agency serves several
          property managers, so the sender alone is not enough to know whose file a certificate belongs
          in. The endpoint requires the INBOUND_PARSE_SECRET as a bearer token, and refuses to run when
          that secret is unset.
        </p>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 className="t-h2">Work-order compliance hook</h2>
        <p className="t-secondary" style={{ marginTop: 4, maxWidth: "62ch" }}>
          A read-only feed of who is compliant, for the PM system that raises work orders. JSON or
          CSV, one row per vendor, with the named reason when a vendor is flagged.
        </p>
        {plan.hooks ? (
          hookKey ? (
            <div style={{ marginTop: 12 }}>
              <CopyField
                value={`${env.appUrl}/api/hooks/compliance?key=${hookKey}`}
                label="JSON feed"
              />
              <div style={{ marginTop: 12 }}>
                <CopyField
                  value={`${env.appUrl}/api/hooks/compliance?format=csv&key=${hookKey}`}
                  label="CSV feed"
                />
              </div>
              <RotateHookKeyButton />
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <p className="t-secondary">No key has been issued yet.</p>
              <RotateHookKeyButton />
            </div>
          )
        ) : (
          <p className="t-secondary" style={{ marginTop: 12 }}>
            The hook is on Portfolio and Enterprise.{" "}
            <Link href="/settings/billing" className="btn-quiet">
              See plans
            </Link>
          </p>
        )}
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 className="t-h2">How this deployment is wired</h2>
        <div style={{ marginTop: 8 }}>
          {wiring.map((row) => (
            <div key={row.label} className="hairline-b" style={{ padding: "14px 0" }}>
              <div className="flex items-baseline justify-between" style={{ gap: 12 }}>
                <span className="t-title">{row.label}</span>
                <span className="t-placard" data-tone="dim" style={{ color: "var(--color-dim)" }}>
                  {row.state}
                </span>
              </div>
              <p className="t-secondary" style={{ marginTop: 4, maxWidth: "62ch" }}>
                {row.detail}
              </p>
            </div>
          ))}
        </div>
        {user.role === "admin" && <RunTickButton />}
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 className="t-h2">Audit log</h2>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          The last {audit.length} things that happened to this file.
        </p>
        <div style={{ marginTop: 12 }}>
          {audit.map((entry) => (
            <div key={entry.id} className="timeline-row">
              <span>{formatStamp(entry.createdAt, org.timezone)}</span>
              <span className="timeline-verb">
                {AUDIT_VERB[entry.action as keyof typeof AUDIT_VERB] ?? entry.action}
              </span>
              <span>{entry.target}</span>
              <span>{entry.actor}</span>
            </div>
          ))}
          {audit.length === 0 && (
            <p className="t-secondary">Nothing yet. Every review, chase and edit lands here.</p>
          )}
        </div>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 className="t-h2">Session</h2>
        <LogoutButton />
      </section>
    </main>
  );
}
