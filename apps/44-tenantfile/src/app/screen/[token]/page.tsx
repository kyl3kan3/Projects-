import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SCREENING_DISCLOSURE, SCREENING_FEE_NOTE, screeningByToken } from "@/lib/screening";
import { ConsentForm } from "./ConsentForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Authorise a screening check",
  robots: { index: false, follow: false },
};

/**
 * The applicant's authorisation page.
 *
 * This is the standalone disclosure the FCRA expects: it says what will be
 * obtained, who is asking, and what the applicant's rights are — and it is not
 * bundled into a wall of other terms. Nothing is ordered by TenantFile either way;
 * what this page produces is a dated, evidenced authorisation.
 */
export default async function ScreeningConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await screeningByToken(token);
  if (!row) notFound();

  const already = row.report.consentAt != null;

  return (
    <main className="screen mx-auto max-w-[560px]" style={{ paddingBottom: 56 }}>
      <header className="pt-10 pb-6">
        <p className="t-label">Screening authorisation</p>
        <h1 className="t-h2 mt-3">
          {row.application.applicantName}, for {row.unit.label} at {row.property.address}
        </h1>
      </header>

      {already ? (
        <div className="notice" data-tone="good">
          <p className="t-title">Already authorised.</p>
          <p className="t-secondary mt-2">
            You authorised this on {row.report.consentAt!.toISOString().slice(0, 10)} as &quot;{row.report.consentName}
            &quot;. Nothing else is needed from you here. Your landlord will be in touch.
          </p>
        </div>
      ) : (
        <>
          <section className="card mb-8 p-4">
            {SCREENING_DISCLOSURE.map((paragraph, i) => (
              <p key={i} className={`t-body ${i > 0 ? "mt-3" : ""}`}>
                {paragraph}
              </p>
            ))}
          </section>

          <section className="mb-8">
            <h2 className="t-label mb-3">Your rights, in short</h2>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              <li className="t-body">Nothing is obtained about you unless you authorise it here.</li>
              <li className="t-body">
                If the landlord decides against you because of something in a report, they must tell you which company
                supplied it.
              </li>
              <li className="t-body">
                You can then ask that company for a free copy of the report within 60 days, and dispute anything in it that
                is wrong.
              </li>
              <li className="t-body">TenantFile never sees the report and does not score you.</li>
            </ul>
            <p className="t-secondary mt-4">{SCREENING_FEE_NOTE}</p>
          </section>

          <ConsentForm token={token} expectedName={row.application.applicantName} />
        </>
      )}
    </main>
  );
}
