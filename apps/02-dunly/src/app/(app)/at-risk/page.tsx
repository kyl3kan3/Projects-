import { requireSession } from "@/lib/auth";
import { atRiskRows } from "@/lib/analytics";
import { money } from "@/lib/format";
import { AtRiskList } from "@/components/AtRiskList";

export const dynamic = "force-dynamic";

export default async function AtRiskPage() {
  const session = await requireSession();
  const rows = await atRiskRows(session.organizationId);
  const total = rows.reduce((sum, r) => sum + r.amountCents, 0);

  return (
    <main className="px-5 pt-6">
      <div className="flex items-baseline justify-between">
        <h1 className="t-h2">At risk</h1>
        <span className="mono text-[15px] text-[var(--color-amber)]">{money(total)}</span>
      </div>
      <p className="t-secondary mt-1">
        Every failing invoice, its retry plan, and where it stands. Pause is
        hold-to-confirm.
      </p>
      <div className="mt-4">
        <AtRiskList rows={rows} />
      </div>
    </main>
  );
}
