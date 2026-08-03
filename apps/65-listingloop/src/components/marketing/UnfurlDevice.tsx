/**
 * The landing device (MARKETING_PLAYBOOK row 65): "Every deadline on the
 * contract, on one line."
 *
 * Four beats, and no more (Law 6):
 *   1. a contract date types in;
 *   2. the timeline unfurls with eleven derived dates snapping into place;
 *   3. the anchor is edited and the moving nodes ghost-shift to their new
 *      positions, with the reason for each move;
 *   4. the T-3 reminder fires to three parties.
 * Then it holds on the full timeline.
 *
 * Everything on screen is computed here, at render time, by the same engine the
 * product runs — the eleven dates, the diff, and the derivation sentences are
 * real output from the buyer-side starter checklist against a real federal
 * holiday calendar. It is demo data and it says so; it is not made up.
 *
 * A server component: no JavaScript ships for this, the beats are CSS delays, so
 * the hero is HTML and CSS and the mobile LCP stays under budget.
 */

import { DealLine } from "@/components/DealLine";
import { computeAll, diffDates, formatShort, type ComputedDate } from "@/lib/dates";
import { federalHolidays, toHolidayMap } from "@/lib/holidays";
import { datedTasks, starterFor } from "@/lib/templates";

const CONTRACT_BEFORE = "2026-05-18";
const CONTRACT_AFTER = "2026-05-22";
const CLOSING = "2026-06-29";
/** The "today" the demo file is read on — inside the T-3 window for Jun 8. */
const DEMO_TODAY = "2026-06-05";

function scenario() {
  const holidays = toHolidayMap([...federalHolidays(2026), ...federalHolidays(2027)]);
  const tasks = datedTasks(starterFor("buyer").tasks);
  const before = computeAll(
    tasks,
    { contract_date: CONTRACT_BEFORE, acceptance_date: CONTRACT_BEFORE, closing_date: CLOSING },
    holidays,
  );
  const after = computeAll(
    tasks,
    { contract_date: CONTRACT_AFTER, acceptance_date: CONTRACT_AFTER, closing_date: CLOSING },
    holidays,
  );
  return { before, after, diff: diffDates(before, after) };
}

function lineDates(dates: ComputedDate[], newByKey?: Map<string, string | null>) {
  return dates
    .filter((d) => d.dueOn)
    .map((d) => ({
      key: d.key,
      label: d.label,
      dueOn: d.dueOn as string,
      status: (d.dueOn as string) < DEMO_TODAY ? ("met" as const) : ("upcoming" as const),
      previewDueOn: newByKey?.get(d.key) ?? undefined,
    }));
}

export function UnfurlDevice() {
  const { before, after, diff } = scenario();
  const newByKey = new Map(diff.map((d) => [d.key, d.newDue]));
  const objection = diff.find((d) => d.key === "inspection_objection");
  const objectionAfter = after.find((d) => d.key === "inspection_objection");

  return (
    <div className="panel overflow-hidden p-5 sm:p-6">
      {/* ---- Beat 1: the contract date types in ---- */}
      <div className="beat" style={{ animationDelay: "0ms" }}>
        <p className="t-label">Buyer-side file · demo data</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="inline-flex items-baseline gap-2">
            <span className="t-label">Contract date</span>
            <span className="t-mono-lg typed-date" style={{ animationDelay: "120ms" }}>
              {formatShort(CONTRACT_BEFORE)}, 2026
            </span>
          </span>
          <span className="inline-flex items-baseline gap-2">
            <span className="t-label">Closing</span>
            <span className="t-mono-lg">{formatShort(CLOSING)}, 2026</span>
          </span>
        </div>
      </div>

      {/* ---- Beat 2: eleven dates unfurl ---- */}
      <div className="beat mt-6" style={{ animationDelay: "420ms" }}>
        <p className="t-secondary">
          {before.filter((d) => d.dueOn).length} deadlines computed from that one date, business
          days and observed holidays included.
        </p>
        <div className="dealline-scroll mt-3">
          <DealLine dates={lineDates(before)} today={DEMO_TODAY} width={960} />
        </div>
      </div>

      {/* ---- Beat 3: the anchor moves, the nodes ghost-shift ---- */}
      <div className="beat mt-6 border-t border-line pt-5" style={{ animationDelay: "1240ms" }}>
        <p className="t-label">
          Contract date corrected · {formatShort(CONTRACT_BEFORE)} → {formatShort(CONTRACT_AFTER)}
        </p>
        <div className="dealline-scroll mt-3">
          <DealLine
            dates={lineDates(before, newByKey)}
            today={DEMO_TODAY}
            unfurl={false}
            compact
            width={960}
          />
        </div>
        <ul className="mt-3 list-none p-0">
          {diff.slice(0, 3).map((row) => (
            <li key={row.key} className="diff-move">
              {row.summary}
            </li>
          ))}
        </ul>
        <p className="diff-reason">
          {diff.length} of {before.filter((d) => d.dueOn).length} dates move. Nothing is saved until
          the diff is approved.
        </p>
      </div>

      {/* ---- Beat 4: the T-3 reminder fires ---- */}
      <div className="beat mt-6 border-t border-line pt-5" style={{ animationDelay: "2060ms" }}>
        <p className="t-label">Reminder ledger</p>
        <p className="t-mono mt-2">
          T-3 · {objectionAfter?.label ?? "Inspection objection deadline"} ·{" "}
          {objection?.newDue ? formatShort(objection.newDue) : ""} · sent to 3 parties
        </p>
        <p className="t-secondary mt-1">
          Buyer, buyer&rsquo;s agent, coordinator — one email each, once. {DEMO_TODAY} pass.
        </p>
        {objectionAfter ? (
          <p className="t-secondary mt-2">{objectionAfter.sentence}</p>
        ) : null}
      </div>
    </div>
  );
}
