import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { bytesToGb } from "@/lib/format";

export const dynamic = "force-dynamic";
export default async function GalleriesPage() {
  const session = await requireSession();
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, session.accountId) });
  const rows = await db.query.galleries.findMany({ where: eq(schema.galleries.accountId, session.accountId), orderBy: desc(schema.galleries.createdAt), limit: 40 });
  const usedGb = bytesToGb(account?.storageUsedBytes ?? 0);
  const quotaGb = bytesToGb(account?.storageQuotaBytes ?? 0);
  const pct = account && account.storageQuotaBytes > 0 ? Math.min(100, Math.round((account.storageUsedBytes / account.storageQuotaBytes) * 100)) : 0;

  return (
    <main className="px-5 pt-6">
      <h1 className="t-h2">Galleries</h1>
      <div className="mt-3">
        <div className="flex items-baseline justify-between"><span className="t-placard">Storage</span><span className="mono text-[var(--color-text-2)]">{usedGb} / {quotaGb} GB</span></div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--color-line)]"><div className="h-full bg-[var(--color-brass)]" style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {rows.length === 0 && <p className="t-secondary col-span-2 py-8">No galleries yet.</p>}
        {rows.map((g, i) => (
          <Link key={g.id} href={`/galleries/${g.id}`} className="block overflow-hidden rounded-[12px] border border-[var(--color-line)]">
            <div style={{ height: 120, background: `linear-gradient(${130 + i * 10}deg, hsl(${30 + i * 5} 16% 26%), hsl(${24 + i * 4} 18% 15%))` }} />
            <div className="p-3">
              <p className="t-title text-[15px]">{g.name}</p>
              <span className={`pill mt-1 ${g.status === "published" ? "pill-fern" : "pill-brass"}`}><span className="dot" />{g.status.toUpperCase()}</span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
