import type { Metadata } from "next";
import Link from "next/link";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconAlert, IconCard, IconChevronRight, IconRows } from "@/components/icons";
import { requireOnboardedUser } from "@/lib/auth";
import { emailReady } from "@/lib/email";
import { plural, timeAgo } from "@/lib/display";
import { orgAsGatable, plan, quoteCapacity, trialDaysLeft } from "@/lib/plans";
import { itemCount } from "@/lib/price-book";
import { storageReady } from "@/lib/storage";
import { stripeConfigured, webhookConfigured } from "@/lib/stripe";
import { transcriptionProvider } from "@/lib/transcription";
import { TRADE_LABELS } from "@/lib/trades";
import { logoutAction } from "@/app/(auth)/actions";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { org, user } = await requireOnboardedUser();
  const items = await itemCount(org.id);
  const capacity = quoteCapacity(orgAsGatable(org));
  const trialLeft = trialDaysLeft(orgAsGatable(org));
  const mail = emailReady();
  const storage = storageReady();
  const features = plan(org.plan);

  const checklist = [
    {
      label: "Price book",
      ready: items > 0,
      detail: items > 0 ? `${plural(items, "item")}` : "Empty — nothing can be drafted",
      href: "/price-book",
    },
    {
      label: "Proposal email",
      ready: mail.ready,
      detail: mail.ready ? "Sending through Resend" : (mail.reason ?? "Not configured"),
      href: null,
    },
    {
      label: "Walkthrough transcription",
      ready: transcriptionProvider() === "whisper",
      detail:
        transcriptionProvider() === "whisper"
          ? "Whisper, biased to your trade's vocabulary"
          : "No OPENAI_API_KEY — drafts come from notes, captions and a labelled sample narration",
      href: null,
    },
    {
      label: "Media storage",
      ready: storage.driver === "r2",
      detail:
        storage.driver === "r2"
          ? "Cloudflare R2"
          : (storage.reason ?? "Local filesystem (development only)"),
      href: null,
    },
    {
      label: "Deposits",
      ready: Boolean(org.stripeConnectAccountId) && stripeConfigured(),
      detail: !stripeConfigured()
        ? "STRIPE_SECRET_KEY is not set on this install"
        : org.stripeConnectAccountId
          ? org.stripeConnectReady
            ? "Connected — deposits land on your own Stripe account"
            : "Connected, waiting on Stripe to finish verification"
          : "Not connected yet",
      href: "/settings/billing",
    },
    {
      label: "Stripe webhooks",
      ready: webhookConfigured(),
      detail: webhookConfigured()
        ? "Signed webhook endpoint configured"
        : "STRIPE_WEBHOOK_SECRET is not set — a paid deposit would not be recorded",
      href: null,
    },
  ];

  return (
    <main>
      <ScreenHeader
        title="Settings"
        meta={`${org.name} · ${TRADE_LABELS[org.trade]}`}
        showSettings={false}
      />

      <section className="gutter" style={{ paddingBottom: 24 }}>
        <Link href="/settings/billing" className="row" style={{ borderTop: "1px solid var(--color-hairline)" }}>
          <IconCard size={18} style={{ color: "var(--color-text-2)" }} />
          <span style={{ flex: 1 }}>
            <span className="t-title" style={{ display: "block" }}>
              {trialLeft !== null ? `Trial · ${plural(trialLeft, "day")} left` : features.name}
            </span>
            <span className="t-secondary" style={{ color: "var(--color-text-3)" }}>
              {capacity.unlimitedish
                ? "Unlimited AI quotes (fair use)"
                : `${capacity.used} of ${capacity.limit} AI quotes this period`}
            </span>
          </span>
          <IconChevronRight size={18} style={{ color: "var(--color-text-3)" }} />
        </Link>
        <Link href="/settings/audit" className="row">
          <IconRows size={18} style={{ color: "var(--color-text-2)" }} />
          <span style={{ flex: 1 }}>
            <span className="t-title" style={{ display: "block" }}>
              Audit log
            </span>
            <span className="t-secondary" style={{ color: "var(--color-text-3)" }}>
              Every draft, edit, send and payment, with who did it
            </span>
          </span>
          <IconChevronRight size={18} style={{ color: "var(--color-text-3)" }} />
        </Link>
      </section>

      <section className="gutter" style={{ paddingBottom: 24 }}>
        <p className="t-label" style={{ paddingBottom: 4 }}>
          Go-live checklist
        </p>
        {checklist.map((entry) => (
          <div key={entry.label} className="row">
            <span
              className="dot"
              style={{ background: entry.ready ? "var(--color-hi-vis)" : "var(--color-amber)" }}
              aria-hidden="true"
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="t-title" style={{ display: "block" }}>
                {entry.label}
              </span>
              <span className="t-secondary" style={{ color: "var(--color-text-3)" }}>
                {entry.detail}
              </span>
            </span>
            {entry.href ? (
              <Link href={entry.href} className="btn-quiet" style={{ flex: "none" }}>
                Fix
              </Link>
            ) : null}
          </div>
        ))}
      </section>

      <section className="gutter">
        <SettingsForm
          defaults={{
            name: org.name,
            licenseNumber: org.licenseNumber ?? "",
            insuranceLine: org.insuranceLine ?? "",
            phone: org.phone ?? "",
            address: org.address ?? "",
            defaultMarkupPct: org.defaultMarkupPct,
            taxRatePct: (org.taxRateBp / 100).toFixed(2),
            defaultDepositType: org.defaultDepositType,
            defaultDepositValue:
              org.defaultDepositType === "fixed"
                ? (org.defaultDepositValue / 100).toFixed(2)
                : String(org.defaultDepositValue),
            termsText: org.termsText ?? "",
          }}
        />
      </section>

      <section className="gutter" style={{ paddingTop: 8, paddingBottom: 32 }}>
        <p className="t-label">Signed in</p>
        <p className="t-secondary" style={{ marginTop: 6 }}>
          {user.email} · joined {timeAgo(user.createdAt)}
        </p>
        <form action={logoutAction} style={{ marginTop: 16 }}>
          <button className="btn btn-secondary btn-full" type="submit">
            Sign out
          </button>
        </form>
        {!mail.ready ? (
          <p
            className="t-secondary"
            style={{ marginTop: 20, color: "var(--color-amber)", display: "flex", gap: 8 }}
          >
            <IconAlert size={18} style={{ flex: "none" }} />
            <span>
              Proposal emails are not leaving this install. Every proposal link still works — copy it
              from the estimate screen and text it.
            </span>
          </p>
        ) : null}
      </section>
    </main>
  );
}
