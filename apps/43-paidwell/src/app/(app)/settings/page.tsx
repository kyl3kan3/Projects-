import type { Metadata } from "next";
import Link from "next/link";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconChevronRight } from "@/components/icons";
import { requireFirm } from "@/lib/auth";
import { recentAudit, describeAction } from "@/lib/audit";
import { firmSettings } from "@/lib/settings";
import { emailReady } from "@/lib/email";
import { formatPlanPrice, plan } from "@/lib/plans";
import { FirmSettingsForm, SendModeControls, SignOutButton, SweepNowButton } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { firm, user } = await requireFirm();
  const settings = firmSettings(firm);
  const audit = await recentAudit(firm.id, 12);
  const features = plan(firm.plan);
  const mail = emailReady();

  return (
    <main>
      <ScreenHeader firmName={firm.name} meta={`${user.email} · ${features.name} plan`} />

      <section className="gutter">
        <h1 className="t-h2">Who decides what gets sent</h1>
        <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 8 }}>
          PaidWell asks your clients for money in your name, so this screen exists to make that
          reversible in one tap.
        </p>
        <div style={{ marginTop: 24 }}>
          <SendModeControls sendMode={firm.sendMode} paused={firm.followUpPaused} />
        </div>
      </section>

      <section className="gutter" style={{ marginTop: 40 }}>
        <p className="t-label" style={{ marginBottom: 12 }}>
          Your firm
        </p>
        <FirmSettingsForm
          name={firm.name}
          replyToEmail={firm.replyToEmail ?? ""}
          senderDomain={firm.senderDomain ?? ""}
          senderVerified={firm.senderVerified}
          defaultTermsDays={settings.defaultTermsDays}
          partialFloor={(settings.partialFloorCents / 100).toFixed(2)}
          lateFeeMention={settings.lateFeeMention}
          lateFeeCopy={settings.lateFeeCopy}
          signature={settings.signature}
        />
      </section>

      <section className="gutter" style={{ marginTop: 40 }}>
        <p className="t-label" style={{ marginBottom: 4 }}>
          Elsewhere
        </p>
        {[
          { href: "/connect", title: "Accounting and imports", meta: "QuickBooks, Xero, CSV" },
          { href: "/approvals", title: "Approval tray", meta: "queued sends waiting for a tap" },
          { href: "/clients", title: "Clients", meta: "VIP exclusions and term overrides" },
          {
            href: "/settings/billing",
            title: "Plan and billing",
            meta: `${features.name} · ${formatPlanPrice(firm.plan)}`,
          },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="row">
            <span style={{ flex: 1 }}>
              <span className="t-title" style={{ display: "block" }}>
                {item.title}
              </span>
              <span className="t-secondary" style={{ color: "var(--color-text-aa)" }}>
                {item.meta}
              </span>
            </span>
            <IconChevronRight size={18} style={{ color: "var(--color-text-aa)" }} />
          </Link>
        ))}
      </section>

      <section className="gutter" style={{ marginTop: 40 }}>
        <p className="t-label" style={{ marginBottom: 12 }}>
          Sending
        </p>
        <p className="t-secondary" style={{ marginBottom: 16 }}>
          {mail.ready
            ? "Email is configured and follow-ups will be delivered."
            : `${mail.reason}. Everything else works: sends are recorded with the exact copy, and the invoice screen shows the reason.`}
        </p>
        <SweepNowButton />
      </section>

      <section className="gutter" style={{ marginTop: 40, marginBottom: 40 }}>
        <p className="t-label" style={{ marginBottom: 4 }}>
          Recent activity
        </p>
        {audit.length === 0 ? (
          <p className="t-secondary" style={{ paddingTop: 12 }}>
            Nothing yet. Every send, pause, escalation, approval and payment lands here.
          </p>
        ) : (
          audit.map((row) => (
            <div key={row.id} className="row">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  {describeAction(row.action)}
                </span>
                <span
                  className="t-secondary"
                  style={{
                    display: "block",
                    color: "var(--color-text-aa)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.target}
                </span>
              </span>
              <span className="t-data" style={{ color: "var(--color-text-aa)", flex: "none" }}>
                {row.actor === "system" ? "system" : "you"}
              </span>
            </div>
          ))
        )}
        <div style={{ marginTop: 24 }}>
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
