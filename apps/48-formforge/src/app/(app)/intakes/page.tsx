import type { Metadata } from "next";
import Link from "next/link";
import { requireUser, actorFor } from "@/lib/auth";
import { clinicianCount, completionStats, settingsOf } from "@/lib/practices";
import { listIntakes } from "@/lib/intakes";
import { getPatientIdentities } from "@/lib/patients";
import { listForms } from "@/lib/forms";
import { sendGate } from "@/lib/plans";
import { ageLabel, completionRate, displayStatus, type DisplayStatus } from "@/lib/format";
import { scoreLine, severityLabel } from "@/lib/screeners";
import { StatusDot } from "@/components/StatusPill";
import { IconAlert, IconChevronRight, IconPlus } from "@/components/icons";
import { clientIp } from "@/lib/request";

export const metadata: Metadata = { title: "Intakes" };

const CHIPS = [
  { key: "all", label: "All" },
  { key: "awaiting", label: "Awaiting" },
  { key: "signed", label: "Signed" },
  { key: "overdue", label: "Overdue" },
] as const;

type ChipKey = (typeof CHIPS)[number]["key"];

function matchesChip(status: DisplayStatus, chip: ChipKey): boolean {
  if (chip === "all") return true;
  if (chip === "signed") return status === "signed" || status === "completed";
  if (chip === "overdue") return status === "overdue" || status === "expired";
  return status === "sent" || status === "started";
}

/**
 * The status board (DESIGN.md "Intakes (practice home)").
 *
 * Two things here are deliberate and easy to get wrong:
 *
 *  - the status on every row is **derived as of now** rather than read from the
 *    stored column, so a packet whose link lapsed in March does not render as
 *    "Sent" because no sweep has run since;
 *  - patient names for the whole board are decrypted in **one** audited batch
 *    read, which puts "opened the board, saw 14 names" in the ledger instead of
 *    fourteen indistinguishable rows.
 */
export default async function IntakesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; sent?: string }>;
}) {
  const params = await searchParams;
  const chip = (CHIPS.find((c) => c.key === params.filter)?.key ?? "all") as ChipKey;
  const { user, practice } = await requireUser();
  const settings = settingsOf(practice);

  const [rows, stats, clinicians, forms] = await Promise.all([
    listIntakes(practice.id, { limit: 200 }),
    completionStats(practice.id, 30),
    clinicianCount(practice.id),
    listForms(practice.id),
  ]);

  const identities = await getPatientIdentities(
    practice,
    rows.map((r) => r.patientId),
    actorFor(user, await clientIp()),
    "status board",
  );

  const now = new Date();
  const decorated = rows.map((row) => ({
    ...row,
    display: displayStatus(row.intake, 120, now),
    patient: identities.get(row.patientId),
  }));
  const visible = decorated.filter((row) => matchesChip(row.display, chip));

  const gate = sendGate({
    plan: practice.plan,
    clinicians,
    trialEndsAt: practice.trialEndsAt,
    subscriptionStatus: practice.subscriptionStatus,
    now,
  });
  const livePackets = forms.filter((f) => f.status === "live");
  const hideScores = settings.hideScoresFromFrontDesk && user.role === "frontdesk";

  return (
    <main className="screen pt-6">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h1 className="t-h2">Intakes</h1>
        <span className="t-label">
          {completionRate(stats.signed, stats.sent)} completion · 30d
        </span>
      </div>
      <p className="t-secondary mb-5">
        {stats.sent === 0
          ? "Nothing sent yet. The number above starts counting with your first packet."
          : `${stats.signed} of ${stats.sent} packets sent in the last 30 days came back signed.`}
      </p>

      {params.sent === "1" && (
        <p
          className="panel mb-5 p-4 t-secondary"
          style={{ color: "var(--color-moss)" }}
          role="status"
        >
          Packet sent. The reminder ladder is scheduled — it stops the moment they finish.
        </p>
      )}

      <nav className="chip-row mb-2" aria-label="Filter intakes">
        {CHIPS.map((c) => {
          const count = decorated.filter((row) => matchesChip(row.display, c.key)).length;
          return (
            <Link
              key={c.key}
              href={c.key === "all" ? "/intakes" : `/intakes?filter=${c.key}`}
              className="chip"
              data-active={chip === c.key}
            >
              {c.label}
              <span className="t-data" style={{ fontSize: 12 }}>
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <EmptyState hasForms={livePackets.length > 0} chip={chip} />
      ) : (
        <ul className="mt-2 list-none p-0">
          {visible.map((row, i) => {
            const flagged = Object.values(row.scoreSummary).some((s) => s.flagged);
            const scores = Object.entries(row.scoreSummary);
            return (
              <li key={row.intake.id} className="enter" style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}>
                <Link href={`/intakes/${row.intake.id}`} className="row no-underline">
                  <StatusDot status={row.display} />
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">
                      {row.patient?.fullName || "Patient record unavailable"}
                    </span>
                    <span className="t-secondary block truncate">
                      {row.formTitle} · v{row.formVersion}
                      {!hideScores && scores.length > 0 && (
                        <>
                          {" · "}
                          <span className="t-data" style={{ fontSize: 12 }}>
                            {scores
                              .map(([key, s]) =>
                                key === "phq9" || key === "gad7"
                                  ? scoreLine({
                                      instrument: key,
                                      total: s.total,
                                      severity: s.severity as never,
                                    })
                                  : `${key.toUpperCase()} ${s.total} ${severityLabel(s.severity)}`,
                              )
                              .join(" · ")}
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                  {flagged && !hideScores && (
                    <span style={{ color: "var(--color-clay)" }} title="A screener item needs review">
                      <IconAlert size={18} />
                    </span>
                  )}
                  <span
                    className="t-data"
                    style={{
                      color:
                        row.display === "overdue" || row.display === "expired"
                          ? "var(--color-clay)"
                          : "var(--color-ink-3)",
                    }}
                  >
                    {ageLabel(row.intake.sentAt, now)}
                  </span>
                  <span style={{ color: "var(--color-ink-3)" }}>
                    <IconChevronRight size={18} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="sticky-action lg:static lg:mt-8 lg:p-0">
        {gate.canSend ? (
          livePackets.length > 0 ? (
            <Link href="/intakes/new" className="btn btn-primary btn-full">
              <IconPlus size={18} />
              Send intake
            </Link>
          ) : (
            <Link href="/forms" className="btn btn-secondary btn-full">
              Build a packet first
            </Link>
          )
        ) : (
          <div>
            <button className="btn btn-primary btn-full" type="button" disabled>
              Send intake
            </button>
            <p className="t-secondary mt-2" style={{ color: "var(--color-clay)" }}>
              {gate.reason}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyState({ hasForms, chip }: { hasForms: boolean; chip: ChipKey }) {
  if (chip !== "all") {
    return (
      <div className="panel mt-4 p-5">
        <p className="t-title">Nothing in this view</p>
        <p className="t-secondary mt-1">
          {chip === "overdue"
            ? "No packet has been sitting unfinished for five days. This is the view you want empty."
            : chip === "signed"
              ? "No signed packets yet. A packet lands here the moment the last consent is signed."
              : "Nothing is waiting on a patient right now."}
        </p>
      </div>
    );
  }
  return (
    <div className="panel mt-4 p-5">
      <p className="t-title">No packets sent yet</p>
      <p className="t-secondary mt-1 mb-4">
        {hasForms
          ? "Your packet is published. Send it to a patient and this board fills with sent, started, and signed states."
          : "Start from a template — behavioral health, physical therapy, or nutrition — edit the consent text to name your practice, and publish. That takes about ten minutes."}
      </p>
      <Link href={hasForms ? "/intakes/new" : "/forms"} className="btn btn-secondary">
        {hasForms ? "Send the first intake" : "Open the template gallery"}
      </Link>
    </div>
  );
}
