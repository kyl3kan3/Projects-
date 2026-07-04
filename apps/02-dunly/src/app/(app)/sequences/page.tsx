import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { ensureDefaultCampaigns } from "@/lib/campaigns";
import { SequenceEditor } from "@/components/SequenceEditor";

export const dynamic = "force-dynamic";

export default async function SequencesPage() {
  const session = await requireSession();
  await ensureDefaultCampaigns(session.organizationId);

  const campaigns = await db.query.recoveryCampaigns.findMany({
    where: eq(schema.recoveryCampaigns.organizationId, session.organizationId),
  });

  const counts = await db
    .select({
      campaignId: schema.messages.campaignId,
      sent: sql<number>`count(*) filter (where ${schema.messages.status} in ('sent','delivered','clicked'))`,
      clicked: sql<number>`count(*) filter (where ${schema.messages.status} = 'clicked')`,
    })
    .from(schema.messages)
    .where(eq(schema.messages.organizationId, session.organizationId))
    .groupBy(schema.messages.campaignId);

  const statFor = (id: string) => {
    const row = counts.find((c) => c.campaignId === id);
    return { sent: Number(row?.sent ?? 0), clicked: Number(row?.clicked ?? 0) };
  };

  return (
    <main className="px-5 pt-6">
      <h1 className="t-h2">Sequences</h1>
      <p className="t-secondary mt-1">
        The messages your customers get, in your voice. Retries run alongside —
        suppressed automatically when Stripe&apos;s own retries are active.
      </p>
      {campaigns.map((c) => (
        <SequenceEditor
          key={c.id}
          campaign={{ id: c.id, name: c.name, type: c.type, steps: c.steps, active: c.active }}
          stats={statFor(c.id)}
        />
      ))}
    </main>
  );
}
