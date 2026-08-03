import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { environmentCounts, getApiBySlug, getTimeline } from "@/lib/queries";
import { env } from "@/lib/env";
import { PLANS } from "@/lib/plans";
import { AppHeader, ScreenTitle } from "@/components/ScreenHeader";
import { TabBar } from "@/components/TabBar";
import { TerminalBlock } from "@/components/CopyMono";
import { Timeline, type TimelineItem } from "./Timeline";
import type { Environment } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug} — timeline` };
}

const ENVIRONMENTS: Array<{ value: Environment | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "prod", label: "Prod" },
  { value: "staging", label: "Staging" },
  { value: "pr", label: "PRs" },
];

export default async function TimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ env?: string }>;
}) {
  const { slug } = await params;
  const { env: envParam } = await searchParams;
  const { org } = await requireUser();
  const api = await getApiBySlug(org.id, slug);
  if (!api) notFound();

  const selectedEnv: Environment | undefined =
    envParam === "prod" || envParam === "staging" || envParam === "pr" ? envParam : undefined;

  const [rows, counts] = await Promise.all([
    getTimeline(api, org.plan, selectedEnv),
    environmentCounts(api.id),
  ]);

  const items: TimelineItem[] = rows.map((row) => ({
    id: row.deploy.id,
    versionLabel: row.deploy.versionLabel,
    environment: row.deploy.environment,
    pushedAt: row.deploy.pushedAt.toISOString(),
    pushedBy: row.deploy.pushedBy,
    isBaseline: row.isBaseline,
    diffId: row.diffId,
    verdict: row.verdict,
    healthScore: row.health.score,
    operations: row.health.operations,
  }));

  const pushCommand = `npx schemasentry push openapi.yaml --api ${api.slug} --version $GIT_SHA`;

  return (
    <>
      <AppHeader apiName={api.name} apiSlug={api.slug} />
      <main className="screen gutter" style={{ paddingTop: 24 }}>
        <div className="wrap" style={{ maxWidth: 720 }}>
          <ScreenTitle
            title={api.name}
            subtitle={`${counts.prod + counts.staging + counts.pr} deploys · ${counts.prod} prod, ${counts.staging} staging, ${counts.pr} from PRs · ${PLANS[org.plan].historyDays}-day history`}
            action={
              <Link href={`/apis/${api.slug}/settings`} className="btn-quiet" style={{ flex: "none" }}>
                API settings
              </Link>
            }
          />

          <nav
            aria-label="Filter by environment"
            className="xscroll"
            style={{ display: "flex", gap: 8, marginBottom: 24, paddingBottom: 4 }}
          >
            {ENVIRONMENTS.map((option) => {
              const active = option.value === "all" ? !selectedEnv : selectedEnv === option.value;
              const href = option.value === "all" ? `/apis/${api.slug}` : `/apis/${api.slug}?env=${option.value}`;
              return (
                <Link key={option.value} href={href} className="chip" data-active={active}>
                  {option.label}
                  {option.value !== "all" ? (
                    <span className="t-data" style={{ fontSize: 11 }}>
                      {counts[option.value as Environment]}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {items.length === 0 ? (
            <section>
              <p className="t-body" style={{ margin: "0 0 8px" }}>
                {selectedEnv ? `No ${selectedEnv} deploys yet.` : "Your first diff appears here."}
              </p>
              <p className="t-secondary" style={{ margin: "0 0 20px" }}>
                Push the spec you deploy. The first push becomes the baseline; the second produces a verdict.
              </p>
              <TerminalBlock
                command={pushCommand}
                note="Needs SCHEMASENTRY_TOKEN — create one in Settings."
              />
              <p className="t-secondary" style={{ marginTop: 24 }}>
                No token, no signup, works offline:{" "}
                <span className="t-data">npx schemasentry diff old.yaml new.yaml</span>
              </p>
            </section>
          ) : (
            <>
              <Timeline slug={api.slug} items={items} />
              <details style={{ marginTop: 32 }}>
                <summary className="t-secondary" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>
                  Push another deploy
                </summary>
                <div style={{ marginTop: 16 }}>
                  <TerminalBlock command={pushCommand} />
                  <p className="t-secondary" style={{ marginTop: 16 }}>
                    CI gate:{" "}
                    <span className="t-data">
                      npx schemasentry check openapi.yaml --api {api.slug} --fail-on breaking
                    </span>
                  </p>
                  <p className="t-secondary" style={{ marginTop: 8 }}>
                    API base: <span className="t-data">{env.apiUrl}</span>
                  </p>
                </div>
              </details>
            </>
          )}
        </div>
      </main>
      <TabBar slug={api.slug} />
    </>
  );
}
