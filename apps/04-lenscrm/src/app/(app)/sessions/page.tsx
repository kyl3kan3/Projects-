import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { fmtDate, fmtTime, money } from "@/lib/format";

export const dynamic = "force-dynamic";
export default async function SessionsPage() {
  const session = await requireSession();
  const rows = await db.query.sessions.findMany({
    where: and(eq(schema.sessions.accountId, session.accountId), ne(schema.sessions.status, "cancelled")),
    orderBy: asc(schema.sessions.startsAt), limit: 60,
  });
  const clientIds = [...new Set(rows.map((s) => s.clientId).filter(Boolean))] as string[];
  const clients = new Map((clientIds.length ? await db.query.clients.findMany({ where: inArray(schema.clients.id, clientIds) }) : []).map((c) => [c.id, c]));
  const balances = await db.query.invoices.findMany({ where: and(eq(schema.invoices.accountId, session.accountId), eq(schema.invoices.kind, "balance")) });
  const balBySession = new Map(balances.map((b) => [b.sessionId, b]));

  return (
    <main className="px-5 pt-6">
      <h1 className="t-h2">Sessions</h1>
      <div className="mt-4 rowlist">
        {rows.length === 0 && <p className="t-secondary py-8">No sessions booked yet.</p>}
        {rows.map((s) => {
          const client = s.clientId ? clients.get(s.clientId) : null;
          const bal = balBySession.get(s.id);
          return (
            <div key={s.id} className="flex items-center gap-3 py-4">
              <div className="min-w-0 flex-1">
                <p className="mono text-[var(--color-brass)]">{fmtDate(s.startsAt)} · {fmtTime(s.startsAt, s.timezone)}</p>
                <p className="t-title mt-0.5">{s.title}</p>
                {client && <p className="t-secondary">{client.name}</p>}
              </div>
              <div className="text-right">
                <span className={`pill ${s.status === "confirmed" ? "pill-fern" : s.status === "completed" ? "pill-fern" : "pill-brass"}`}><span className="dot" />{s.status.toUpperCase()}</span>
                {bal && bal.status === "open" && <p className="mono mt-1 text-[var(--color-text-2)]">bal {money(bal.totalCents)}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
