import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const session = await requireSession();
  const deals = await db.query.deals.findMany({
    where: eq(schema.deals.orgId, session.orgId),
    orderBy: desc(schema.deals.lastMeetingAt),
  });

  return (
    <main className="px-5 pt-6">
      <h1 className="t-h2">Deals</h1>
      <p className="t-secondary mt-1">Every deal, with the running history of what was actually said.</p>
      <div className="mt-4 rowlist">
        {deals.length === 0 && (
          <p className="t-secondary py-8">Deals appear here once meetings are linked to your CRM.</p>
        )}
        {deals.map((d) => (
          <Link key={d.id} href={`/deals/${d.id}`} className="flex items-center gap-3 py-4">
            <div className="min-w-0 flex-1">
              <p className="t-title" style={{ fontFamily: "var(--font-serif)", fontSize: 17 }}>{d.name}</p>
              <p className="mono mt-0.5 text-[var(--color-stone)]">
                {d.stage ?? "—"}
                {d.lastMeetingAt ? ` · last met ${fmtDate(d.lastMeetingAt)}` : ""}
              </p>
            </div>
            {d.amountCents != null && (
              <span className="mono text-[15px]">${(d.amountCents / 100).toLocaleString()}</span>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}
