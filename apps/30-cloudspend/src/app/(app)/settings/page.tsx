import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireOrg } from "@/lib/auth";
import { getDb } from "@/db";
import { alertChannels, alertLog } from "@/db/schema";
import { listAccounts } from "@/lib/accounts";
import { env } from "@/lib/env";
import { plan } from "@/lib/plans";
import { trialDaysLeft } from "@/lib/billing";
import { stampUtc } from "@/lib/dates";
import {
  AlertEmailForm,
  DigestForm,
  RemoveEmailButton,
  RotateWebhookButton,
  SignOutButton,
  SlackForm,
} from "./SettingsForms";
import { CopyLine } from "@/components/CopyLine";
import { IconArrowLeft, IconBell, IconHash, IconPlug } from "@/components/icons";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { org, user } = await requireOrg();
  const db = getDb();
  const accounts = await listAccounts(org.id);
  const emails = await db
    .select()
    .from(alertChannels)
    .where(and(eq(alertChannels.orgId, org.id), eq(alertChannels.kind, "email")));
  const recent = await db
    .select()
    .from(alertLog)
    .where(eq(alertLog.orgId, org.id))
    .orderBy(desc(alertLog.createdAt))
    .limit(8);

  const base = env.appUrl.replace(/\/$/, "");
  const webhookUrl = `${base}/api/webhooks/deploy/${org.deployWebhookToken}`;
  const trial = trialDaysLeft(org);
  const gates = plan(org.plan);

  return (
    <main>
      <header
        className="gutter"
        style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12, paddingBottom: 8 }}
      >
        <Link
          href="/watch"
          aria-label="Back to the watch"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            marginLeft: -10,
            color: "var(--color-text-2)",
          }}
        >
          <IconArrowLeft size={22} />
        </Link>
        <span className="t-data" style={{ color: "var(--color-text-2)" }}>
          {org.name}
        </span>
      </header>

      <section className="gutter">
        <h1 className="t-h2">Settings</h1>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          Signed in as {user.email} · {gates.name} plan
          {trial !== null ? ` · ${trial} day${trial === 1 ? "" : "s"} left in the trial` : ""}
        </p>
      </section>

      {/* --- AWS accounts ------------------------------------------------- */}
      <section className="gutter" style={{ paddingTop: 32 }}>
        <h2 className="t-label">AWS accounts</h2>
        <div style={{ marginTop: 4 }}>
          {accounts.length === 0 ? (
            <p className="t-secondary" style={{ marginTop: 8 }}>
              No accounts connected yet.
            </p>
          ) : (
            accounts.map((account) => (
              <div key={account.id} className="row">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {account.label}
                  </span>
                  <span className="t-data" style={{ color: "var(--color-text-3)" }}>
                    {account.accountId} ·{" "}
                    {account.connectStatus === "verified"
                      ? account.provider === "demo"
                        ? "CONNECTED · DEMO DATA"
                        : "CONNECTED"
                      : account.connectStatus.toUpperCase()}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>
        <Link className="btn btn-secondary btn-full" href="/connect" style={{ marginTop: 16 }}>
          <IconPlug size={18} />
          Manage accounts
        </Link>
      </section>

      {/* --- Slack -------------------------------------------------------- */}
      <section className="gutter" style={{ paddingTop: 40 }}>
        <h2 className="t-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <IconHash size={16} />
          Slack
        </h2>
        <p className="t-secondary" style={{ marginTop: 8, marginBottom: 16 }}>
          {org.slackBotToken
            ? `Alerts go to ${org.slackChannelName ? `#${org.slackChannelName}` : org.slackChannelId}. Ack from the message and the dashboard follows.`
            : "Not connected. Alerts are going to email instead — nothing is lost, but Slack is where the ritual lives."}
        </p>
        <SlackForm
          botToken={Boolean(org.slackBotToken)}
          channelId={org.slackChannelId ?? ""}
          channelName={org.slackChannelName ?? ""}
        />
      </section>

      {/* --- Digest ------------------------------------------------------- */}
      <section className="gutter" style={{ paddingTop: 40 }}>
        <h2 className="t-label">Digest</h2>
        <p className="t-secondary" style={{ marginTop: 8, marginBottom: 16 }}>
          Spend so far, the forecast against last month, and the top movers. One
          message per period, whatever else happens.
        </p>
        <DigestForm frequency={org.digestFrequency} />
      </section>

      {/* --- Email fallback ---------------------------------------------- */}
      <section className="gutter" style={{ paddingTop: 40 }}>
        <h2 className="t-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <IconBell size={16} />
          Alert email
        </h2>
        <div style={{ marginTop: 4, marginBottom: 16 }}>
          {emails.map((channel) => (
            <div key={channel.id} className="row" style={{ minHeight: 48 }}>
              <span className="t-data" style={{ flex: 1, minWidth: 0 }}>
                {channel.target}
              </span>
              <RemoveEmailButton channelId={channel.id} email={channel.target} />
            </div>
          ))}
        </div>
        <AlertEmailForm />
      </section>

      {/* --- Deploy webhook ---------------------------------------------- */}
      <section className="gutter" style={{ paddingTop: 40 }}>
        <h2 className="t-label">Deploy webhook</h2>
        <p className="t-secondary" style={{ marginTop: 8, marginBottom: 12 }}>
          Point a GitHub webhook at this URL (push or deployment_status events), or
          post to it from the end of your deploy script. Sign the body with the
          secret below as <code className="t-data">x-hub-signature-256</code>.
        </p>
        <CopyLine label="Webhook URL" value={webhookUrl} />
        <CopyLine label="Signing secret" value={org.deployWebhookSecret} secret />
        <details style={{ marginTop: 16 }}>
          <summary
            className="t-secondary"
            style={{ color: "var(--color-steel)", cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}
          >
            The one-line version for a deploy script
          </summary>
          <pre
            className="t-data scroll-x"
            style={{
              marginTop: 12,
              padding: 12,
              background: "var(--color-panel)",
              border: "1px solid var(--color-hairline)",
              borderRadius: "var(--radius-control)",
              color: "var(--color-text-2)",
            }}
          >{`BODY='{"service":"api-server","sha":"'"$(git rev-parse --short HEAD)"'"}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$CLOUDSPEND_SECRET" | awk '{print $2}')"
curl -sS -X POST ${webhookUrl} \\
  -H "content-type: application/json" \\
  -H "x-hub-signature-256: $SIG" \\
  -d "$BODY"`}</pre>
        </details>
        <div style={{ marginTop: 12 }}>
          <RotateWebhookButton />
        </div>
      </section>

      {/* --- Alert history ---------------------------------------------- */}
      <section className="gutter" style={{ paddingTop: 40 }}>
        <h2 className="t-label">Recent alerts</h2>
        <div style={{ marginTop: 4 }}>
          {recent.length === 0 ? (
            <p className="t-secondary" style={{ marginTop: 8 }}>
              Nothing has needed saying yet.
            </p>
          ) : (
            recent.map((row) => (
              <div key={row.id} className="row" style={{ alignItems: "flex-start" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-secondary" style={{ display: "block", color: "var(--color-text)" }}>
                    {row.summary}
                  </span>
                  <span className="t-data" style={{ color: "var(--color-text-3)" }}>
                    {row.kind.toUpperCase()} · {row.channelKind.toUpperCase()} ·{" "}
                    {row.status === "logged" ? "LOGGED (NO CHANNEL CONFIGURED)" : row.status.toUpperCase()}{" "}
                    · {stampUtc(row.createdAt).toUpperCase()}
                  </span>
                  {row.error ? (
                    <span className="t-data" style={{ color: "var(--color-amber)", display: "block", marginTop: 4 }}>
                      {row.error}
                    </span>
                  ) : null}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="gutter" style={{ paddingTop: 40, paddingBottom: 56, display: "grid", gap: 12 }}>
        <Link className="btn btn-secondary btn-full" href="/settings/billing">
          Plan and billing
        </Link>
        <SignOutButton />
      </section>
    </main>
  );
}
