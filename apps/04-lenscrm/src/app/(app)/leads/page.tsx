import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { LeadPipeline } from "@/components/LeadPipeline";

export const dynamic = "force-dynamic";
export default async function LeadsPage() {
  const session = await requireSession();
  const leads = await db.query.leads.findMany({ where: eq(schema.leads.accountId, session.accountId), orderBy: desc(schema.leads.createdAt), limit: 100 });
  const active = leads.filter((l) => l.stage !== "lost" && l.stage !== "booked").length;
  return (
    <main className="px-5 pt-6">
      <div className="flex items-baseline justify-between">
        <h1 className="t-h2">Leads</h1>
        <span className="mono text-[var(--color-brass)]">{active} active</span>
      </div>
      <p className="t-secondary mt-1">Inquiry to booked — advance a lead through the pipeline.</p>
      <div className="mt-4">
        <LeadPipeline leads={leads.map((l) => ({ id: l.id, name: l.name, shootType: l.shootType, stage: l.stage, createdAt: l.createdAt.toISOString(), message: l.message }))} />
      </div>
    </main>
  );
}
