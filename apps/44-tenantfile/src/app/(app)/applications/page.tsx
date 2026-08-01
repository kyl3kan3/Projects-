import type { Metadata } from "next";
import Link from "next/link";
import { requireLandlord } from "@/lib/auth";
import { landlordPipeline } from "@/lib/applications";
import { incomeRatioLabel, statusLabel } from "@/lib/application-pipeline";
import { applicationSummary } from "@/lib/application-pipeline";
import { formatDate } from "@/lib/money";

export const metadata: Metadata = { title: "Applications" };
export const dynamic = "force-dynamic";

const ORDER = ["new", "invited_to_screen", "screened", "approved", "declined"] as const;

export default async function ApplicationsPage() {
  const { landlord } = await requireLandlord();
  const pipeline = await landlordPipeline(landlord.id);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/units" className="btn-quiet no-underline">
          Units
        </Link>
        <h1 className="t-h2 mt-4">Applications</h1>
        <p className="t-secondary mt-1">
          {pipeline.length === 0
            ? "Nothing yet."
            : `${pipeline.length} in total, newest first inside each stage.`}
        </p>
      </header>

      {pipeline.length === 0 ? (
        <div className="card p-4">
          <p className="t-title">No applications yet.</p>
          <p className="t-secondary mt-2">
            List a vacancy and paste its link into Craigslist or a Facebook group. Everything people submit lands here,
            with their documents attached.
          </p>
          <Link href="/units" className="btn btn-primary btn-full mt-4">
            Go to your units
          </Link>
        </div>
      ) : (
        ORDER.map((stage) => {
          const rows = pipeline.filter((p) => p.application.status === stage);
          if (rows.length === 0) return null;
          return (
            <section key={stage} className="mb-8">
              <h2 className="t-label mb-3">
                {statusLabel(stage)} · {rows.length}
              </h2>
              <div className="stagger flex flex-col gap-3">
                {rows.map(({ application, unit, property }, i) => (
                  <Link
                    key={application.id}
                    href={`/applications/${application.id}`}
                    className="card block p-4 no-underline"
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="t-title truncate">{application.applicantName}</p>
                        <p className="t-data mt-1">
                          {property.address} {unit.label}
                        </p>
                        <p className="t-secondary mt-2">
                          {applicationSummary(
                            application.answers.monthlyIncomeCents,
                            unit.rentCents,
                            application.answers.occupants,
                          )}
                        </p>
                        <p className="t-secondary" style={{ color: "var(--color-text-3)" }}>
                          Applied {formatDate(application.submittedAt.toISOString().slice(0, 10), { year: true })} · wants{" "}
                          {formatDate(application.answers.moveInOn)}
                        </p>
                      </div>
                      <span className="t-data shrink-0">
                        {incomeRatioLabel(application.answers.monthlyIncomeCents, unit.rentCents)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })
      )}
    </main>
  );
}
