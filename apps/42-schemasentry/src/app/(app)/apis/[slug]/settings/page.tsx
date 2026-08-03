import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  getApiBySlug,
  listAcknowledgements,
  listCheckRuns,
  listConsumers,
  listContractSuites,
  planState,
} from "@/lib/queries";
import { canUse } from "@/lib/plans";
import { allRules, normalizePolicy } from "@/core/rules";
import { assertionsFromJson } from "@/core/contract-tests";
import { relativeTime } from "@/lib/format";
import { env } from "@/lib/env";
import { AppHeader, ScreenTitle } from "@/components/ScreenHeader";
import { TabBar } from "@/components/TabBar";
import { ApiIdentityForm, ContractSuites, PolicyForm, type RuleView, type SuiteView } from "./Forms";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug} — settings` };
}

export default async function ApiSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org } = await requireUser();
  const api = await getApiBySlug(org.id, slug);
  if (!api) notFound();

  const state = await planState(org);
  const now = new Date();
  const policyGate = canUse(state, now, "policyOverrides");
  const suiteGate = canUse(state, now, "contractTests");

  const [suites, consumerRows, acks, checks] = await Promise.all([
    listContractSuites(api.id),
    listConsumers(api.id),
    listAcknowledgements(api.id),
    listCheckRuns(api.id, 10),
  ]);

  const policy = normalizePolicy(api.policy);
  const rules: RuleView[] = allRules().map((rule) => ({
    id: rule.id,
    level: rule.level,
    side: rule.side,
    template: rule.template,
    why: rule.why,
    override: policy.overrides[rule.id] ?? null,
  }));

  const suiteViews: SuiteView[] = suites.map(({ suite, consumer }) => ({
    id: suite.id,
    filename: suite.filename,
    framework: suite.framework,
    consumerName: consumer?.name ?? null,
    assertionCount: assertionsFromJson(suite.assertions).length,
    generatedLabel: relativeTime(suite.generatedAt, now),
    sourceLabel: suite.sourceDeployId.slice(0, 8),
  }));

  return (
    <>
      <AppHeader apiName={api.name} apiSlug={api.slug} />
      <main className="screen gutter" style={{ paddingTop: 24 }}>
        <div className="wrap" style={{ maxWidth: 720 }}>
          <ScreenTitle title="API settings" subtitle={api.slug} />

          <section style={{ marginBottom: 56 }}>
            <h2 className="t-h2" style={{ fontSize: 18, margin: "0 0 20px" }}>
              Identity and alerts
            </h2>
            <ApiIdentityForm
              slug={api.slug}
              name={api.name}
              visibility={api.visibility}
              slackWebhookUrl={api.slackWebhookUrl ?? ""}
            />
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 className="t-h2" style={{ fontSize: 18, margin: "0 0 8px" }}>
              CI
            </h2>
            <p className="t-secondary" style={{ margin: "0 0 16px" }}>
              Two commands and a token. The generic step works on any CI; the GitHub Action wraps the same CLI.
            </p>
            <div className="terminal xscroll" style={{ marginBottom: 16 }}>
              <span className="terminal-prompt">$ </span>
              npx schemasentry check openapi.yaml --api {api.slug} --fail-on {policy.failOn}
              <br />
              <span className="terminal-prompt">$ </span>
              npx schemasentry push openapi.yaml --api {api.slug} --version $GIT_SHA
            </div>
            <p className="t-secondary" style={{ margin: 0 }}>
              API base <span className="t-data">{env.apiUrl}</span> · token in{" "}
              <Link href="/settings">organization settings</Link> · workflow file in{" "}
              <span className="t-data">.github/workflows/schemasentry.yml</span> (see{" "}
              <span className="t-data">action.yml</span> in the repo).
            </p>

            {checks.length > 0 ? (
              <ul className="rows hairline-t hairline-b" style={{ listStyle: "none", margin: "20px 0 0", padding: 0 }}>
                {checks.map((check) => (
                  <li key={check.id} className="row">
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="t-data" style={{ display: "block" }}>
                        {check.repository ?? "generic"} {check.prNumber ? `#${check.prNumber}` : ""}
                      </span>
                      <span className="t-secondary">
                        {check.provider} · {relativeTime(check.updatedAt, now)}
                        {check.commentRef ? " · PR comment updated in place" : ""}
                      </span>
                    </span>
                    <span
                      className="t-data level-label"
                      data-level={
                        check.conclusion === "failure"
                          ? "breaking"
                          : check.conclusion === "neutral"
                            ? "risky"
                            : "compatible"
                      }
                    >
                      {check.conclusion}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 className="t-h2" style={{ fontSize: 18, margin: "0 0 8px" }}>
              Breaking-change policy
            </h2>
            <p className="t-secondary" style={{ margin: "0 0 20px" }}>
              {rules.length} rules, each with a default level you can promote, demote or ignore. Every verdict cites
              the rule and the exact JSON pointer, so a classification you disagree with is arguable rather than a
              support ticket.
            </p>
            <PolicyForm
              slug={api.slug}
              rules={rules}
              failOn={policy.failOn}
              blocked={policyGate.allowed ? null : policyGate.message}
            />
          </section>

          <section style={{ marginBottom: 56 }} id="contract-tests">
            <h2 className="t-h2" style={{ fontSize: 18, margin: "0 0 8px" }}>
              Contract tests
            </h2>
            <p className="t-secondary" style={{ margin: "0 0 20px" }}>
              Runnable suites asserting the shapes consumers depend on. Point one at staging with{" "}
              <span className="t-data">API_BASE_URL</span> and it fails before your consumers do.
            </p>
            <ContractSuites
              slug={api.slug}
              suites={suiteViews}
              consumerOptions={consumerRows.map((r) => ({ id: r.consumer.id, name: r.consumer.name }))}
              blocked={suiteGate.allowed ? null : suiteGate.message}
            />
          </section>

          <section>
            <h2 className="t-h2" style={{ fontSize: 18, margin: "0 0 8px" }}>
              Acknowledgements
            </h2>
            <p className="t-secondary" style={{ margin: "0 0 20px" }}>
              Recorded intent, kept forever. An ack turns a finding neutral without deleting the reasoning.
            </p>
            {acks.length === 0 ? (
              <p className="t-secondary" style={{ margin: 0 }}>
                None yet.
              </p>
            ) : (
              <ul className="rows hairline-t hairline-b" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {acks.map((ack) => (
                  <li key={ack.id} className="row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                    <span className="t-data" style={{ color: "var(--color-text)" }}>
                      {ack.ruleId}
                    </span>
                    <span className="t-body">{ack.note}</span>
                    <span className="t-secondary">
                      {ack.actor} · {relativeTime(ack.createdAt, now)} · scope {ack.scopeKey}
                    </span>
                    <span className="t-data xscroll" style={{ color: "var(--color-diffdim-text)", maxWidth: "100%" }}>
                      {ack.jsonPointer}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
      <TabBar slug={api.slug} />
    </>
  );
}
