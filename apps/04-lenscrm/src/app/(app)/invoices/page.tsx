import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { fmtDate, money } from "@/lib/format";

export const dynamic = "force-dynamic";
export default async function InvoicesPage() {
  const session = await requireSession();
  const rows = await db.query.invoices.findMany({ where: eq(schema.invoices.accountId, session.accountId), orderBy: desc(schema.invoices.createdAt), limit: 60 });
  const clientIds = [...new Set(rows.map((r) => r.clientId).filter(Boolean))] as string[];
  const clients = new Map((clientIds.length ? await db.query.clients.findMany({ where: inArray(schema.clients.id, clientIds) }) : []).map((c) => [c.id, c]));

  const paid = rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.totalCents, 0);
  const outstanding = rows.filter((r) => r.status === "open").reduce((s, r) => s + r.totalCents, 0);

  return (
    <main className="px-5 pt-6">
      <h1 className="t-h2">Money</h1>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div><p className="t-placard">Collected</p><p className="invoice-total mt-1">{money(paid)}</p></div>
        <div><p className="t-placard">Outstanding</p><p className="invoice-total mt-1" style={{ color: outstanding > 0 ? "var(--color-clay)" : undefined }}>{money(outstanding)}</p></div>
      </div>
      <div className="mt-6 rowlist">
        {rows.length === 0 && <p className="t-secondary py-8">No invoices yet — they appear when a booking is signed.</p>}
        {rows.map((inv) => {
          const client = inv.clientId ? clients.get(inv.clientId) : null;
          return (
            <div key={inv.id} className="flex items-center gap-3 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="t-title text-[15px]">{client?.name ?? "Client"}</p>
                <p className="mono text-[var(--color-text-3)]">{inv.kind.toUpperCase()}{inv.dueAt ? ` · due ${fmtDate(inv.dueAt)}` : ""}</p>
              </div>
              <span className="mono text-[15px]">{money(inv.totalCents)}</span>
              <span className={`pill ${inv.status === "paid" ? "pill-fern" : inv.status === "open" ? "pill-clay" : "pill-brass"}`}><span className="dot" />{inv.status === "open" ? "DUE" : inv.status.toUpperCase()}</span>
            </div>
          );
        })}
      </div>
    </main>
  );
}
