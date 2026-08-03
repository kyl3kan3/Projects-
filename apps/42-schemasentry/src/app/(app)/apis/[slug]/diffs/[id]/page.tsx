import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDiff, listCheckRuns, listContractSuites } from "@/lib/queries";
import { assertionsFromJson, staleAssertions } from "@/core/contract-tests";
import type { Finding } from "@/core/rules";
import { relativeTime } from "@/lib/format";
import { AppHeader, ScreenTitle } from "@/components/ScreenHeader";
import { TabBar } from "@/components/TabBar";
import { VerdictStamp } from "@/components/Verdict";
import { TerminalBlock } from "@/components/CopyMono";
import { FindingCard, type FindingView } from "./FindingCard";
import { CompatibleList } from "./CompatibleList";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug} — diff` };
}

export default async function DiffPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { org } = await requireUser();
  const diff = await getDiff(org.id, id);
  if (!diff || diff.apiSlug !== slug) notFound();

  const [checks, suites] = await Promise.all([listCheckRuns(diff.apiId, 20), listContractSuites(diff.apiId)]);
  const check = checks.find((c) => c.diffId === diff.id);

  // Which generated contract assertions would fail if this shipped? Computed
  // here rather than stored, so it is always true of the suite as it is now.
  const stale = suites.flatMap(({ suite, consumer }) => {
    const matches = staleAssertions(
      assertionsFromJson(suite.assertions),
      diff.findings as unknown as Finding[],
    );
    return matches.map((m) => ({
      suiteId: suite.id,
      filename: suite.filename,
      consumerName: consumer?.name ?? null,
      description: m.assertion.description,
      endpoint: `${m.assertion.method} ${m.assertion.endpoint}`,
      because: m.finding.message,
    }));
  });

  const breaking = diff.findings.filter((f) => f.level === "breaking");
  const risky = diff.findings.filter((f) => f.level === "risky");
  const acknowledged = diff.findings.filter((f) => f.level === "info");
  const compatible = diff.findings.filter((f) => f.level === "compatible");
  const ordered = [...breaking, ...risky, ...acknowledged];

  const toView = (f: (typeof diff.findings)[number]): FindingView => ({
    id: f.id,
    ruleId: f.ruleId,
    level: f.level,
    defaultLevel: f.defaultLevel,
    jsonPointer: f.jsonPointer,
    endpoint: f.endpoint,
    method: f.method,
    message: f.message,
    why: f.why,
    diffLines: f.diffLines,
    impactedConsumers: f.impactedConsumers,
    acknowledged: f.acknowledged,
  });

  const impactedConsumers = diff.impacts.filter((i) => i.impacted);
  const checkCommand = `npx schemasentry check openapi.yaml --api ${diff.apiSlug} --fail-on breaking`;

  return (
    <>
      <AppHeader apiName={diff.apiName} apiSlug={diff.apiSlug} />
      <main className="screen gutter" style={{ paddingTop: 24 }}>
        <div className="wrap" style={{ maxWidth: 760 }}>
          {/* The verdict stamp is the top of the screen, not a card. */}
          <VerdictStamp
            fromLabel={diff.fromDeploy.versionLabel}
            toLabel={diff.toDeploy.versionLabel}
            verdict={diff.verdict}
            summary={diff.summary}
          />

          <p className="t-secondary" style={{ margin: "16px 0 0" }}>
            {diff.toDeploy.environment === "pr" ? "Pull-request candidate" : `${diff.toDeploy.environment} deploy`} ·
            computed {relativeTime(diff.computedAt)} · engine {diff.engineVersion}
            {diff.failsPolicy ? " · fails your CI policy" : " · does not fail your CI policy"}
          </p>

          {check?.prNumber ? (
            <p className="t-secondary" style={{ margin: "8px 0 0" }}>
              {check.repository} #{check.prNumber} · check {check.conclusion}
              {check.commentRef ? " · PR comment updated in place" : " · no GitHub credentials, so no PR comment was posted"}
            </p>
          ) : null}

          {impactedConsumers.length > 0 ? (
            <section style={{ marginTop: 24 }} className="card">
              <p className="t-label" style={{ color: "var(--color-text-2)", margin: "0 0 12px" }}>
                Consumer impact
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
                {impactedConsumers.map((impact) => (
                  <li key={impact.consumerId}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="dot" data-level={impact.worst ?? "info"} aria-hidden="true" />
                      <span className="t-title">{impact.name}</span>
                    </span>
                    <ul style={{ listStyle: "none", margin: "4px 0 0 14px", padding: 0 }}>
                      {impact.details.slice(0, 4).map((detail, i) => (
                        <li key={i} className="t-secondary">
                          {detail.message} — {detail.reason}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ) : diff.impacts.length > 0 ? (
            <p className="t-secondary" style={{ margin: "16px 0 0" }}>
              None of your {diff.impacts.length} registered consumer
              {diff.impacts.length === 1 ? "" : "s"} declared usage that this change touches.
            </p>
          ) : null}

          {stale.length > 0 ? (
            <section style={{ marginTop: 24 }} className="card">
              <p className="t-label" style={{ color: "var(--color-amber)", margin: "0 0 12px" }}>
                {stale.length} contract assertion{stale.length === 1 ? "" : "s"} would fail
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                {stale.slice(0, 6).map((item, i) => (
                  <li key={i} className="t-secondary">
                    <span className="t-data">{item.endpoint}</span> — {item.description}
                    <br />
                    <span style={{ color: "var(--color-text-3-aa)" }}>
                      because: {item.because}
                      {item.consumerName ? ` (${item.consumerName}'s suite)` : ` (${item.filename})`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="t-secondary" style={{ margin: "12px 0 0" }}>
                <Link href={`/apis/${diff.apiSlug}/settings#contract-tests`}>Regenerate the suites</Link> once the
                change is intentional.
              </p>
            </section>
          ) : null}

          <ScreenTitle
            title={
              ordered.length === 0
                ? "No consumer-visible changes"
                : `${ordered.length} finding${ordered.length === 1 ? "" : "s"}`
            }
            subtitle={
              ordered.length === 0
                ? "The two specs describe the same contract, apart from anything counted as compatible below."
                : undefined
            }
          />

          <div style={{ display: "grid", gap: 16 }}>
            {ordered.map((finding, index) => {
              const strikeRank = finding.level === "breaking" ? breaking.indexOf(finding) : -1;
              return (
                <FindingCard
                  key={finding.id}
                  finding={toView(finding)}
                  diffId={diff.id}
                  index={index}
                  strikeRank={strikeRank}
                  fromPr={Boolean(check?.prNumber)}
                />
              );
            })}
          </div>

          {compatible.length > 0 ? (
            <CompatibleList
              items={compatible.map((f) => ({
                id: f.id,
                message: f.message,
                endpoint: f.endpoint ? `${f.method ?? ""} ${f.endpoint}`.trim() : "API-wide",
                jsonPointer: f.jsonPointer,
              }))}
            />
          ) : null}

          {/* Thumb zone: publish the draft when there is one, otherwise the
              command that would have caught this in CI. */}
          <div
            style={{
              position: "sticky",
              bottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 12px)",
              marginTop: 32,
            }}
          >
            {diff.draft && diff.draft.status === "draft" ? (
              <Link href={`/apis/${diff.apiSlug}/changelog`} className="btn btn-primary btn-full">
                Publish changelog draft
              </Link>
            ) : (
              <TerminalBlock command={checkCommand} note="Add this to your PR workflow." />
            )}
          </div>
        </div>
      </main>
      <TabBar slug={diff.apiSlug} />
    </>
  );
}
