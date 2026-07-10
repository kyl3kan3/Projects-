import Link from "next/link";
import { and, asc, eq, gte, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { fmtDate, fmtTime, money } from "@/lib/format";
import { BrandMark, IconClock } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession();
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, session.accountId) });

  const upcoming = await db.query.sessions.findMany({
    where: and(eq(schema.sessions.accountId, session.accountId), gte(schema.sessions.startsAt, new Date(Date.now() - 86400_000)), ne(schema.sessions.status, "cancelled")),
    orderBy: asc(schema.sessions.startsAt),
    limit: 6,
  });
  const clientIds = [...new Set(upcoming.map((s) => s.clientId).filter(Boolean))] as string[];
  const clientsById = new Map(
    (clientIds.length ? await db.query.clients.findMany({ where: inArray(schema.clients.id, clientIds) }) : []).map((c) => [c.id, c]),
  );

  // Tasks: unpaid balances due soon, contracts awaiting signature, undelivered galleries
  const openBalances = await db.query.invoices.findMany({
    where: and(eq(schema.invoices.accountId, session.accountId), eq(schema.invoices.status, "open")),
    orderBy: asc(schema.invoices.dueAt),
    limit: 4,
  });
  const draftGalleries = await db.query.galleries.findMany({
    where: and(eq(schema.galleries.accountId, session.accountId), eq(schema.galleries.status, "draft")),
    limit: 3,
  });
  const unsigned = await db.query.contracts.findMany({
    where: and(eq(schema.contracts.accountId, session.accountId), eq(schema.contracts.status, "sent")),
    limit: 3,
  });

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = session.name.split(" ")[0];

  return (
    <main className="px-5 pt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><BrandMark size={24} /><span className="font-semibold">{account?.name ?? "LensCRM"}</span></div>
      </div>
      <h1 className="t-h2 mt-6">{greet}, {first}.</h1>
      <p className="t-secondary mt-1">This week on the wall.</p>

      <div className="mt-5 space-y-4">
        {upcoming.length === 0 && (
          <div className="placard p-5"><p className="t-title">No sessions yet</p><p className="t-secondary mt-1">Share a booking page and confirmed shoots appear here.</p></div>
        )}
        {upcoming.map((s, i) => {
          const client = s.clientId ? clientsById.get(s.clientId) : null;
          const tone = 28 + (i % 4) * 5;
          return (
            <Link key={s.id} href="/sessions" className="session-card block">
              <div className="relative" style={{ height: 168, background: `linear-gradient(${135 + i * 8}deg, hsl(${tone} 16% 24%), hsl(${tone + 6} 20% 14%))` }}>
                <span className={`pill absolute right-3 top-3 ${s.status === "confirmed" ? "pill-fern" : "pill-brass"}`} style={{ background: "rgba(20,20,20,.6)" }}>
                  <span className="dot" />{s.status === "confirmed" ? "CONFIRMED" : "PENDING"}
                </span>
              </div>
              <div className="session-strip">
                <p className="mono text-[var(--color-brass)]">{fmtDate(s.startsAt)} · {fmtTime(s.startsAt, s.timezone)}</p>
                <p className="t-title mt-1">{s.title}</p>
                {client && <p className="t-secondary mt-0.5">{client.name}{client.partnerName ? ` & ${client.partnerName}` : ""}</p>}
              </div>
            </Link>
          );
        })}
      </div>

      {(openBalances.length > 0 || draftGalleries.length > 0 || unsigned.length > 0) && (
        <section className="mt-8">
          <p className="t-placard">Today</p>
          <div className="task-thread mt-3 pl-4">
            {openBalances.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 py-3">
                <IconClock size={16} className="text-[var(--color-brass)]" />
                <span className="t-body flex-1 text-[15px]">Balance due{inv.dueAt ? ` — ${fmtDate(inv.dueAt)}` : ""}</span>
                <span className="mono">{money(inv.totalCents)}</span>
              </div>
            ))}
            {unsigned.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-3">
                <IconClock size={16} className="text-[var(--color-brass)]" />
                <span className="t-body flex-1 text-[15px]">Awaiting signature — {c.title}</span>
              </div>
            ))}
            {draftGalleries.map((g) => (
              <div key={g.id} className="flex items-center gap-3 py-3">
                <IconClock size={16} className="text-[var(--color-brass)]" />
                <span className="t-body flex-1 text-[15px]">Deliver gallery — {g.name}</span>
                <Link href={`/galleries/${g.id}`} className="btn-quiet text-sm">Open</Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
