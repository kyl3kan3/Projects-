import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDiff, getTimeline, listCheckRuns, listContractSuites } from "@/lib/queries";
import { assertionsFromJson, staleAssertions } from "@/core/contract-tests";
import type { Finding } from "@/core/rules";
import { relativeTime } from "@/lib/format";
import { AppHeader, ScreenTitle } from "@/components/ScreenHeader";
import { TabBar } from "@/components/TabBar";
import { VerdictStamp, VerdictWord } from "@/components/Verdict";
import { TerminalBlock } from "@/components/CopyMono";
import { FindingCard, type FindingView } from "./FindingCard";
import { CompatibleList } from "./CompatibleList";
import { RecomputeButton } from "./RecomputeButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug} — diff` };
}

function RailRow({
  row,
  current,
}: {
  row: Awaited<ReturnType<typeof getTimeline>>[number];
  current: boolean;
}) {
  return (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          className="t-data"
          style={{ display: "block", color: current ? "var(--color-text)" : "var(--color-text-2)", fontWeight: current ? 600 : 400 }}
        >
          {row.deploy.versionLabel}
        </span>
        <span className="t-secondary" style={{ display: "block", fontSize: 11 }}>
          {row.deploy.environment}
          {row.isBaseline ? " · baseline" : ""}
        </span>
      </span>
      {row.verdict ? <VerdictWord level={row.verdict} /> : null}
    </>
  );
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

  const [checks, suites, railRows] = await Promise.all([
    listCheckRuns(diff.apiId, 20),
    listContractSuites(diff.apiId),
    // The rail, for the >=1024 three-pane layout. Hidden below that width — the
    // Timeline tab is the mobile route to the same list.
    getTimeline({ ...diff, id: diff.apiId, slug: diff.apiSlug, name: diff.apiName } as never, org.plan, undefined, 12),
  ]);
  // The check run is the latest communication about a PR; the PR itself is
  // recorded on the deploy, so an older diff in the same PR keeps its context.
  const check = diff.prRef
    ? checks.find((c) => `${c.repository}#${c.prNumber}` === diff.prRef)
    : undefined;

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
        <div className="wrap">
          <div className="diff-panes">
            {/* Pane 1: the deploy rail. */}
            <aside className="pane-rail" aria-label="Recent deploys">
              <p className="t-label" style={{ color: "var(--color-text-2)", margin: "0 0 12px" }}>
                Deploys
              </p>
              <ul className="rows hairline-t hairline-b" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {railRows.map((row) => {
                  const current = row.deploy.id === diff.toDeploy.id;
                  return (
                    <li key={row.deploy.id}>
                      {row.diffId ? (
                        <Link
                          href={`/apis/${diff.apiSlug}/diffs/${row.diffId}`}
                          className="row"
                          style={{ minHeight: 44, color: "inherit", textDecoration: "none" }}
                          aria-current={current ? "page" : undefined}
                        >
                          <RailRow row={row} current={current} />
                        </Link>
                      ) : (
                        <span className="row" style={{ minHeight: 44 }}>
                          <RailRow row={row} current={current} />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </aside>

            {/* Pane 2: the diff itself. */}
            <div className="pane-main" style={{ minWidth: 0 }}>
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

          <RecomputeButton diffId={diff.id} engineVersion={diff.engineVersion} />

          {diff.prRef ? (
            <p className="t-secondary" style={{ margin: "8px 0 0" }}>
              {diff.prRef}
              {check ? ` · latest check ${check.conclusion}` : ""}
              {check?.commentRef
                ? " · PR comment updated in place"
                : " · no GitHub credentials, so no PR comment was posted"}
            </p>
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

          <div className="stack" style={{ gap: 16 }}>
            {ordered.map((finding, index) => {
              const strikeRank = finding.level === "breaking" ? breaking.indexOf(finding) : -1;
              return (
                <FindingCard
                  key={finding.id}
                  finding={toView(finding)}
                  diffId={diff.id}
                  index={index}
                  strikeRank={strikeRank}
                  fromPr={diff.prRef !== null}
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

          {/*
            Thumb zone: publish the draft when there is one, otherwise the command
            that would have caught this in CI.

            Deliberately NOT sticky. A sticky block here floats over the finding
            cards while you scroll, and every card carries an Acknowledge control
            in exactly that band — so the one action the screen exists to offer
            was sitting under a "Copy check command" panel. The diff screen ends
            with this block, which puts it in the thumb zone when you reach it.
          */}
          <div style={{ marginTop: 32 }}>
            {diff.draft && diff.draft.status === "draft" ? (
              <Link href={`/apis/${diff.apiSlug}/changelog`} className="btn btn-primary btn-full">
                Publish changelog draft
              </Link>
            ) : (
              <TerminalBlock command={checkCommand} note="Add this to your PR workflow." />
            )}
          </div>
            </div>

            {/* Pane 3: the wider context — who this breaks, and what it invalidates. */}
            <div className="pane-side" style={{ minWidth: 0 }}>
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
            </div>
          </div>
        </div>
      </main>
      <TabBar slug={diff.apiSlug} />
    </>
  );
}
