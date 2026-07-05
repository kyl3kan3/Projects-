import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { fmtDate, fmtMeta } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Per-deal intelligence timeline: linked meetings + extracted signals on a
 *  vertical hairline spine. The question "when did pricing last come up?" is
 *  answerable here. */
export default async function DealTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const deal = await db.query.deals.findFirst({
    where: and(eq(schema.deals.id, id), eq(schema.deals.orgId, session.orgId)),
  });
  if (!deal) notFound();

  const links = await db.query.meetingDealLinks.findMany({ where: eq(schema.meetingDealLinks.dealId, deal.id) });
  const meetings = links.length
    ? await db.query.meetings.findMany({
        where: inArray(schema.meetings.id, links.map((l) => l.meetingId)),
        orderBy: desc(schema.meetings.startsAt),
      })
    : [];

  // Merge meetings and signals into one dated spine.
  type Entry = { at: Date; kind: "meeting" | "signal"; text: string; href?: string; meta?: string };
  const entries: Entry[] = [
    ...meetings.map((m) => ({
      at: m.startsAt ?? m.createdAt,
      kind: "meeting" as const,
      text: m.title,
      href: `/meetings/${m.id}`,
      meta: fmtMeta(m.startsAt, m.durationSeconds, m.platform),
    })),
    ...deal.signals.map((s) => ({ at: new Date(s.at), kind: "signal" as const, text: s.text, meta: s.kind })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <main className="px-5 pt-6 pb-8">
      <Link href="/deals" className="btn-quiet inline-flex px-0">← Deals</Link>
      <h1 className="t-display mt-3" style={{ fontSize: "clamp(24px, 6vw, 32px)" }}>{deal.name}</h1>
      <div className="mono mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[var(--color-stone)]">
        <span>{deal.stage ?? "—"}</span>
        {deal.amountCents != null && <span>${(deal.amountCents / 100).toLocaleString()}</span>}
        {deal.closeDate && <span>close {fmtDate(deal.closeDate)}</span>}
      </div>

      <div className="mt-7 border-l border-[var(--color-line)] pl-5">
        {entries.map((e, i) => (
          <div key={i} className="relative pb-6">
            <span
              className="absolute -left-[23px] top-1.5 h-2 w-2 rounded-full"
              style={{ background: e.kind === "meeting" ? "var(--color-ink)" : "var(--color-blue)" }}
            />
            <p className="mono text-[var(--color-stone)]">{fmtDate(e.at)}{e.meta ? ` · ${e.meta}` : ""}</p>
            {e.href ? (
              <Link href={e.href} className="t-title mt-0.5 block" style={{ fontFamily: "var(--font-serif)", fontSize: 17 }}>
                {e.text}
              </Link>
            ) : (
              <p className="t-body mt-0.5 text-[15px]">{e.text}</p>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
