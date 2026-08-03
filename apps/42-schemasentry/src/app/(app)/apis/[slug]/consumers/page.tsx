import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getApiBySlug, listConsumers, planState } from "@/lib/queries";
import { canUse } from "@/lib/plans";
import { relativeTime } from "@/lib/format";
import { usageSummary } from "@/core/impact";
import { AppHeader, ScreenTitle } from "@/components/ScreenHeader";
import { TabBar } from "@/components/TabBar";
import { ConsumerList, type ConsumerListItem } from "./ConsumerList";
import { knownEndpoints } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug} — consumers` };
}

export default async function ConsumersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org } = await requireUser();
  const api = await getApiBySlug(org.id, slug);
  if (!api) notFound();

  const gate = canUse(await planState(org), new Date(), "consumerRegistry");
  const [rows, known] = await Promise.all([
    listConsumers(api.id),
    knownEndpoints(api.id, api.baselineDeployId),
  ]);
  const now = new Date();

  const items: ConsumerListItem[] = rows.map((row) => ({
    id: row.consumer.id,
    name: row.consumer.name,
    contact: row.consumer.contact ?? "",
    notify: row.consumer.notify,
    endpoints: row.usage.endpoints,
    fields: row.usage.fields,
    enumValues: row.usage.enumValues,
    usageSummary: usageSummary(row.usage),
    impactedCount: row.impactedCount,
    lastImpactedLabel: row.lastImpactedAt ? relativeTime(row.lastImpactedAt, now) : null,
  }));

  return (
    <>
      <AppHeader apiName={api.name} apiSlug={api.slug} />
      <main className="screen gutter" style={{ paddingTop: 24 }}>
        <div className="wrap" style={{ maxWidth: 720 }}>
          <ScreenTitle
            title="Consumers"
            subtitle={`${items.length} registered · ${known.length} operations in the current spec`}
          />

          {gate.allowed ? (
            <ConsumerList slug={api.slug} known={known} items={items} />
          ) : (
            <div className="card">
              <p className="t-label" style={{ color: "var(--color-amber)", margin: "0 0 8px" }}>
                Not on your plan
              </p>
              <p className="t-body" style={{ margin: "0 0 16px" }}>
                {gate.message}
              </p>
              <p className="t-secondary" style={{ margin: 0 }}>
                Without the registry, verdicts are still correct — they just cannot name who a change breaks.
              </p>
            </div>
          )}
        </div>
      </main>
      <TabBar slug={api.slug} />
    </>
  );
}
