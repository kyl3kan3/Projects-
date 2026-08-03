import type { Metadata } from "next";
import Link from "next/link";
import { requireOrg } from "@/lib/auth";
import { connectLink, listAccounts } from "@/lib/accounts";
import { factsSummary } from "@/lib/facts";
import { visibleStatements } from "@/lib/aws/policy";
import { accountLimitMessage, canAddAccount, plan } from "@/lib/plans";
import { env } from "@/lib/env";
import { stampUtc } from "@/lib/dates";
import { AddAccountForm, CurForm, RemoveAccountForm, VerifyForm } from "./ConnectForms";
import { IconAlert, IconArrowLeft, IconCheck, IconClock, IconExternal } from "@/components/icons";

export const metadata: Metadata = { title: "Connect AWS" };
export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const { org } = await requireOrg();
  const accounts = await listAccounts(org.id);
  const canAdd = canAddAccount(org.plan, accounts.length);
  const demoMode = !env.awsConfigured;
  const summaries = new Map(
    await Promise.all(
      accounts
        .filter((a) => a.connectStatus === "verified")
        .map(async (a) => [a.id, await factsSummary(a.id)] as const),
    ),
  );

  return (
    <main>
      <header
        className="gutter"
        style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12, paddingBottom: 8 }}
      >
        {accounts.some((a) => a.connectStatus === "verified") ? (
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
        ) : null}
        <span className="t-label" style={{ color: "var(--color-steel)" }}>
          CloudSpend
        </span>
      </header>

      <section className="gutter">
        <h1 className="t-h2">Connect an AWS account</h1>
        <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 8 }}>
          One CloudFormation stack, read-only, about five minutes. The role can read
          your costs and describe your resources. It cannot start, stop, modify or
          delete anything — and the whole policy is below, before you click.
        </p>
      </section>

      {demoMode ? (
        <section className="gutter" style={{ paddingTop: 20 }}>
          <div className="card" style={{ padding: 16 }}>
            <p className="t-label state-open" style={{ margin: 0 }}>
              Demo mode
            </p>
            <p className="t-secondary" style={{ marginTop: 8 }}>
              This deployment has no AWS credential configured, so an account you
              connect here is fed by a deterministic synthetic estate instead of
              your real bill. Every screen it feeds says so. Set
              AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and
              CLOUDSPEND_AWS_ACCOUNT_ID to connect for real.
            </p>
          </div>
        </section>
      ) : null}

      {/* Existing accounts, each at its own step of the flow. */}
      {accounts.length ? (
        <section className="gutter" style={{ paddingTop: 32, display: "grid", gap: 32 }}>
          {accounts.map((account) => (
            <div key={account.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <h2 className="t-title" style={{ margin: 0 }}>
                  {account.label}
                </h2>
                <span className="t-data" style={{ color: "var(--color-text-3)" }}>
                  {account.accountId}
                </span>
              </div>

              <p
                className={`t-label ${
                  account.connectStatus === "verified"
                    ? "state-resolved"
                    : account.connectStatus === "error"
                      ? "state-open"
                      : "state-acked"
                }`}
                style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}
              >
                {account.connectStatus === "verified" ? (
                  <IconCheck size={16} />
                ) : account.connectStatus === "error" ? (
                  <IconAlert size={16} />
                ) : (
                  <IconClock size={16} />
                )}
                {account.connectStatus === "verified"
                  ? `Connected${account.provider === "demo" ? " · demo data" : ""}`
                  : account.connectStatus === "error"
                    ? "Not connected"
                    : "Waiting for the stack"}
              </p>

              {account.connectError ? (
                <p className="t-secondary" style={{ color: "var(--color-amber)", marginTop: 8 }}>
                  {account.connectError}
                </p>
              ) : null}

              {account.connectStatus === "verified" ? (
                <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                  <p className="t-data" style={{ color: "var(--color-text-2)" }}>
                    VERIFIED {account.verifiedAt ? stampUtc(account.verifiedAt).toUpperCase() : "—"}
                    {account.ingestedThrough
                      ? ` · COSTS THROUGH ${stampUtc(account.ingestedThrough).toUpperCase()}`
                      : ""}
                  </p>
                  <p className="t-secondary">
                    {(() => {
                      const summary = summaries.get(account.id);
                      if (!summary || summary.rows === 0) {
                        return "No cost rows yet — the backfill runs on the next tick.";
                      }
                      return `${summary.rows.toLocaleString("en-US")} cost rows backfilled${
                        summary.from ? `, from ${summary.from.toISOString().slice(0, 10)}` : ""
                      }${summary.to ? ` to ${summary.to.toISOString().slice(0, 10)}` : ""}.`;
                    })()}
                  </p>
                  <p className="t-data" style={{ color: "var(--color-text-3)" }}>
                    REGIONS {account.regions.length ? account.regions.slice(0, 4).join(" ") : "—"}
                  </p>
                </div>
              ) : (
                <div style={{ marginTop: 16 }}>
                  <p className="t-data" style={{ color: "var(--color-text-2)", marginBottom: 8 }}>
                    EXTERNAL ID {account.externalId}
                  </p>
                  <VerifyForm
                    accountId={account.id}
                    defaultRoleArn={account.roleArn}
                    quickCreateHref={connectLink(account)}
                  />
                </div>
              )}

              <details style={{ marginTop: 20 }}>
                <summary
                  className="t-secondary"
                  style={{ color: "var(--color-steel)", cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}
                >
                  Cost & Usage Report (optional — resource-level accuracy)
                </summary>
                <div style={{ paddingTop: 16 }}>
                  <p className="t-secondary" style={{ marginBottom: 16 }}>
                    Cost Explorer gives us service and region. Your CUR gives us the
                    instance id. Point us at the bucket and prefix and CUR takes over
                    every hour it covers — the Cost Explorer rows for those hours are
                    replaced, never added to.
                  </p>
                  <CurForm
                    accountId={account.id}
                    curBucket={account.curBucket ?? ""}
                    curPrefix={account.curPrefix ?? ""}
                  />
                  {account.curCoveredThrough ? (
                    <p className="t-data" style={{ color: "var(--color-text-3)", marginTop: 12 }}>
                      CUR COVERS THROUGH {stampUtc(account.curCoveredThrough).toUpperCase()}
                    </p>
                  ) : null}
                </div>
              </details>

              <div style={{ marginTop: 12 }}>
                <RemoveAccountForm accountId={account.id} label={account.label} />
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* Add another. */}
      <section className="gutter" style={{ paddingTop: 32 }}>
        <h2 className="t-label" style={{ marginBottom: 16 }}>
          {accounts.length ? "Add another account" : "Start here"}
        </h2>
        {canAdd ? (
          <AddAccountForm />
        ) : (
          <div className="card" style={{ padding: 16 }}>
            <p className="t-title" style={{ margin: 0 }}>
              You are at your account limit
            </p>
            <p className="t-secondary" style={{ marginTop: 8 }}>
              {accountLimitMessage(org.plan)}
            </p>
            <Link className="btn btn-secondary btn-full" href="/settings/billing" style={{ marginTop: 16 }}>
              See plans
            </Link>
          </div>
        )}
      </section>

      {/* The policy, in full, with a reason per statement. */}
      <section className="gutter" style={{ paddingTop: 40, paddingBottom: 40 }}>
        <h2 className="t-label">What the role can do</h2>
        <p className="t-secondary" style={{ marginTop: 8, marginBottom: 16 }}>
          {plan(org.plan).name} plan · every permission, and why it is there. Nothing
          in this list can change anything in your account.
        </p>
        <a
          className="btn-quiet"
          href={`/api/cloudformation${
            accounts.find((a) => a.curBucket)?.curBucket
              ? `?curBucket=${encodeURIComponent(accounts.find((a) => a.curBucket)?.curBucket ?? "")}`
              : ""
          }`}
          target="_blank"
          rel="noreferrer"
          style={{ paddingLeft: 0, marginBottom: 8 }}
        >
          Read the CloudFormation template
          <IconExternal size={16} />
        </a>
        <div>
          {visibleStatements(accounts.find((a) => a.curBucket)?.curBucket).map((statement) => (
            <div key={statement.sid} className="row" style={{ alignItems: "flex-start" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-data" style={{ display: "block", color: "var(--color-text)" }}>
                  {statement.actions.join("  ")}
                </span>
                <span className="t-secondary" style={{ display: "block", marginTop: 4 }}>
                  {statement.why}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
