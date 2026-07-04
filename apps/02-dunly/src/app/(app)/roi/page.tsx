import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { overviewStats } from "@/lib/analytics";
import { money } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/** The ROI statement: fine stationery on a phone. One-tap print/PDF. */
export default async function RoiPage() {
  const session = await requireSession();
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, session.organizationId),
  });
  const stats = await overviewStats(session.organizationId, 30);
  if (!org) return null;

  const fee = org.plan in PLANS ? PLANS[org.plan as keyof typeof PLANS].priceMonthly * 100 : 4900;
  const multiple = fee > 0 ? Math.round(stats.recoveredCents / fee) : 0;
  const monthName = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <main className="stationery min-h-screen">
      <div className="mx-auto max-w-md px-6 py-12">
        <p className="t-label" style={{ color: "#6a7a74" }}>Recovery statement</p>
        <h1 className="t-h2 mt-1" style={{ color: "#181d20" }}>{org.name}</h1>
        <p className="mono mt-1" style={{ color: "#8a948f" }}>{monthName}</p>

        <div className="mt-8 space-y-0">
          {[
            ["Recovered by Dunly", stats.recoveredCents, true],
            ["Prevented failures (pre-dunning)", stats.preventedCents, false],
            ["Baseline recoveries (not counted)", stats.baselineCents, false],
            ["Still at risk", stats.atRiskCents, false],
          ].map(([label, cents, hero]) => (
            <div
              key={label as string}
              className="hair flex items-baseline justify-between border-t py-3.5"
            >
              <span style={{ color: "#4a5450", fontSize: 14 }}>{label as string}</span>
              <span
                className="mono"
                style={{
                  color: hero ? "#181d20" : "#6a7a74",
                  fontSize: hero ? 17 : 14,
                  fontWeight: hero ? 600 : 500,
                }}
              >
                {money(cents as number)}
              </span>
            </div>
          ))}
        </div>

        {multiple > 1 && (
          <p className="hair mt-8 border-t pt-6 text-[15px] leading-relaxed" style={{ color: "#181d20" }}>
            Dunly recovered <span className="mono" style={{ fontWeight: 600 }}>{money(stats.recoveredCents)}</span>{" "}
            this month — <span style={{ color: "#33a06f", fontWeight: 600 }}>{multiple}× your subscription</span>.
          </p>
        )}

        <PrintButton />
      </div>
    </main>
  );
}
