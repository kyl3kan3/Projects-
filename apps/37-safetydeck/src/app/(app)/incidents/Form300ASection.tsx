"use client";

import { certifyAction, saveDenominatorsAction } from "./actions";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";

/**
 * The 300A: the totals as they stand, the two denominators the form needs, and
 * the certification. The totals are computed from the log every time this renders
 * — a summary read from a stored column is how a company posts last month's
 * numbers on the wall for three months.
 */
export function Form300ASection({
  year,
  summary,
  certifiedBy,
}: {
  year: number;
  summary: {
    deaths: number;
    daysAwayCases: number;
    restrictedCases: number;
    otherRecordableCases: number;
    totalCases: number;
    totalDaysAway: number;
    totalDaysRestricted: number;
    openCases: number;
    needsJudgmentCases: number;
    annualAvgEmployees: number | null;
    totalHoursWorked: number | null;
  };
  certifiedBy: { name: string | null; title: string | null; phone: string | null; at: string | null };
}) {
  return (
    <section className="mt-10">
      <h2 className="t-label">300A totals · {year}</h2>
      <div className="panel mt-3 p-5">
        <Row label="(G) Deaths" value={summary.deaths} />
        <Row label="(H) Cases with days away" value={summary.daysAwayCases} />
        <Row label="(I) Cases with transfer or restriction" value={summary.restrictedCases} />
        <Row label="(J) Other recordable cases" value={summary.otherRecordableCases} />
        <Row label="(K) Total days away" value={summary.totalDaysAway} />
        <Row label="(L) Total days restricted" value={summary.totalDaysRestricted} />
        <Row label="Total recordable cases" value={summary.totalCases} emphasis />
      </div>

      {summary.openCases > 0 ? (
        <p className="t-secondary msg msg-note mt-3">
          {summary.openCases} case{summary.openCases === 1 ? " is" : "s are"} still accruing
          days. Update the counts before you certify — the K and L totals will move.
        </p>
      ) : null}
      {summary.needsJudgmentCases > 0 ? (
        <p className="t-secondary msg msg-note mt-2">
          {summary.needsJudgmentCases} case{summary.needsJudgmentCases === 1 ? "" : "s"} logged as
          recordable pending a judgment call. Resolve them before certifying.
        </p>
      ) : null}

      <ActionForm action={saveDenominatorsAction} className="mt-6">
        <input type="hidden" name="year" value={year} />
        <p className="t-label">Employment numbers the 300A needs</p>
        <label className="mt-3 flex flex-col gap-2">
          <span className="t-secondary">Annual average number of employees</span>
          <input
            className="input input-mono"
            name="annualAvgEmployees"
            type="number"
            min={0}
            defaultValue={summary.annualAvgEmployees ?? ""}
            placeholder="24"
          />
        </label>
        <label className="mt-3 flex flex-col gap-2">
          <span className="t-secondary">Total hours worked by all employees</span>
          <input
            className="input input-mono"
            name="totalHoursWorked"
            type="number"
            min={0}
            defaultValue={summary.totalHoursWorked ?? ""}
            placeholder="49920"
          />
        </label>
        <div className="mt-4">
          <SubmitButton className="btn btn-secondary btn-full" pendingLabel="Saving…">
            Save {year} numbers
          </SubmitButton>
        </div>
      </ActionForm>

      <ActionForm action={certifyAction} className="mt-8 rule-t pt-6">
        <input type="hidden" name="year" value={year} />
        <p className="t-label">Certification — 1904.32(b)(3)</p>
        <p className="t-secondary mt-2">
          A company executive certifies that they examined the log and believe the summary is
          correct. Their name prints on the signature line.
        </p>
        {certifiedBy.at ? (
          <p className="t-data mt-3" style={{ color: "var(--color-green)" }}>
            CERTIFIED {certifiedBy.at} · {certifiedBy.name}
          </p>
        ) : null}
        <label className="mt-3 flex flex-col gap-2">
          <span className="t-secondary">Name</span>
          <input className="input" name="name" defaultValue={certifiedBy.name ?? ""} placeholder="Dale Hutchins" />
        </label>
        <label className="mt-3 flex flex-col gap-2">
          <span className="t-secondary">Title</span>
          <input className="input" name="title" defaultValue={certifiedBy.title ?? ""} placeholder="Owner" />
        </label>
        <label className="mt-3 flex flex-col gap-2">
          <span className="t-secondary">Phone</span>
          <input className="input input-mono" name="phone" defaultValue={certifiedBy.phone ?? ""} placeholder="(509) 555-0142" />
        </label>
        <div className="mt-4">
          <SubmitButton className="btn btn-secondary btn-full" pendingLabel="Recording…">
            Certify the {year} summary
          </SubmitButton>
        </div>
      </ActionForm>
    </section>
  );
}

function Row({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className="rule-b flex items-baseline justify-between gap-4 py-2.5 last:border-b-0">
      <span className="t-secondary">{label}</span>
      <span
        className="t-mono"
        style={{ fontSize: emphasis ? 20 : 15, color: emphasis ? "var(--color-paper)" : undefined }}
      >
        {value}
      </span>
    </div>
  );
}
