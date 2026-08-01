import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { jobs as jobsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOffice } from "@/lib/auth";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { FenceIcon } from "@/components/icons";
import { formatClockTime, formatDayLabel, formatShortDate, t } from "@/lib/i18n";
import {
  addDaysToDateKey,
  formatDuration,
  localDateKey,
  payPeriodFor,
  zonedParts,
} from "@/lib/time";
import {
  editHistory,
  entriesForOrgRange,
  entrySeconds,
  needsReview,
  periodApproval,
} from "@/lib/time-entries";
import type { DictionaryKey } from "@/lib/i18n";
import { EditSheet, type EditableEntry } from "./EditSheet";
import { approvePeriodAction, reopenPeriodAction } from "./actions";

export const metadata: Metadata = { title: "Review" };
export const dynamic = "force-dynamic";

/** "2026-02-24T07:03" in the org's zone, for a datetime-local field. */
function toLocalInput(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; approved?: string; error?: string; saved?: string }>;
}) {
  const { user, org } = await requireOffice();
  const locale = user.locale;
  const params = await searchParams;
  const now = new Date();
  const timeZone = org.timezone;

  const anchor = params.period ?? localDateKey(now, timeZone);
  const period = payPeriodFor(anchor, {
    payPeriod: org.payPeriod,
    weekStartsOn: org.weekStartsOn,
  });
  const previous = payPeriodFor(addDaysToDateKey(period.start, -1), {
    payPeriod: org.payPeriod,
    weekStartsOn: org.weekStartsOn,
  });
  const next = payPeriodFor(addDaysToDateKey(period.end, 1), {
    payPeriod: org.payPeriod,
    weekStartsOn: org.weekStartsOn,
  });

  const rows = await entriesForOrgRange(org.id, period.start, period.end, timeZone);
  const approval = await periodApproval(org.id, period.start, period.end);

  const db = getDb();
  const jobOptions = await db
    .select({ id: jobsTable.id, name: jobsTable.name })
    .from(jobsTable)
    .where(eq(jobsTable.organizationId, org.id));

  const flagged = rows.filter((r) => needsReview(r.entry));
  const clean = rows.filter((r) => !needsReview(r.entry));

  const editSheetStrings = {
    title: t(locale, "review.edit.title"),
    in: t(locale, "review.edit.in"),
    out: t(locale, "review.edit.out"),
    break: t(locale, "review.edit.break"),
    job: t(locale, "review.edit.job"),
    reason: t(locale, "review.edit.reason"),
    reasonHelp: t(locale, "review.edit.reasonHelp"),
    submit: t(locale, "review.edit.submit"),
    cancel: t(locale, "common.cancel"),
    history: t(locale, "review.edit.history"),
    holding: t(locale, "common.saving"),
    confirm: t(locale, "review.edit.submit"),
    edit: t(locale, "review.edit.title"),
  };

  // Only the flagged rows carry their edit history — that is where a dispute
  // starts, and loading every history for a clean period is wasted work.
  const histories = new Map<string, { line: string }[]>();
  for (const row of flagged) {
    const items = await editHistory(row.entry.id);
    histories.set(
      row.entry.id,
      items.map(({ edit, editorName }) => ({
        line: t(locale, "review.edit.historyLine", {
          who: editorName ?? "—",
          field: edit.field,
          old: edit.oldValue ?? "—",
          new: edit.newValue ?? "—",
          reason: edit.reason,
        }),
      })),
    );
  }

  const errorKey: DictionaryKey | null =
    params.error === "REASON_REQUIRED"
      ? "review.error.reasonRequired"
      : params.error === "OUT_BEFORE_IN"
        ? "review.error.outBeforeIn"
        : params.error === "PERIOD_LOCKED"
          ? "review.error.locked"
          : null;

  const totalSeconds = rows.reduce((sum, r) => sum + entrySeconds(r.entry, now), 0);

  return (
    <main className="screen">
      <header className="pt-8 pb-4">
        <p className="t-label">{t(locale, "review.title")}</p>
        <h1 className="t-h2 mt-2">
          {t(locale, "review.period", {
            start: formatShortDate(period.start, locale),
            end: formatShortDate(period.end, locale),
          })}
        </h1>
        <p className="t-data mt-2" style={{ color: "var(--fg-2)" }}>
          {formatDuration(totalSeconds)} ·{" "}
          {rows.length === 1
            ? t(locale, "review.entryCount.one")
            : t(locale, "review.entryCount.many", { count: rows.length })}
        </p>
      </header>

      <div className="mb-5 flex gap-2">
        <Link href={`/review?period=${previous.start}`} className="chip">
          ← {formatShortDate(previous.start, locale)}
        </Link>
        <Link href={`/review?period=${next.start}`} className="chip">
          {formatShortDate(next.start, locale)} →
        </Link>
      </div>

      {errorKey ? (
        <p className="t-secondary mb-4" role="alert" style={{ color: "var(--bad)" }}>
          {t(locale, errorKey)}
        </p>
      ) : null}
      {params.approved || params.saved ? (
        <p className="t-secondary mb-4" role="status" style={{ color: "var(--accent)" }}>
          {params.approved
            ? t(locale, "review.approved", { when: formatShortDate(period.end, locale) })
            : t(locale, "settings.saved")}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <section className="panel p-5">
          <p className="t-title">{t(locale, "review.empty")}</p>
          <p className="t-secondary mt-2">{t(locale, "review.emptyHelp")}</p>
        </section>
      ) : (
        <>
          {flagged.length > 0 ? (
            <section className="mb-8">
              <p className="t-label mb-2">{t(locale, "review.flaggedFirst")}</p>
              <div className="stagger">
                {flagged.map((row) => (
                  <EntryRow
                    key={row.entry.id}
                    row={row}
                    locale={locale}
                    timeZone={timeZone}
                    now={now}
                    jobOptions={jobOptions}
                    period={period.start}
                    strings={editSheetStrings}
                    history={histories.get(row.entry.id) ?? []}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {clean.length > 0 ? (
            <section className="mb-8">
              <p className="t-label mb-2">{t(locale, "review.clean")}</p>
              <div className="stagger">
                {clean.map((row) => (
                  <EntryRow
                    key={row.entry.id}
                    row={row}
                    locale={locale}
                    timeZone={timeZone}
                    now={now}
                    jobOptions={jobOptions}
                    period={period.start}
                    strings={editSheetStrings}
                    history={[]}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <div className="pb-4">
            {approval ? (
              <form action={reopenPeriodAction} className="flex flex-col gap-3">
                <input type="hidden" name="periodStart" value={period.start} />
                <input type="hidden" name="periodEnd" value={period.end} />
                <p className="t-secondary">
                  {t(locale, "review.approved", {
                    when: formatDayLabel(approval.approvedAt, timeZone, locale),
                  })}
                </p>
                <button className="btn btn-secondary" type="submit">
                  {t(locale, "review.reopen")}
                </button>
              </form>
            ) : (
              <form action={approvePeriodAction}>
                <input type="hidden" name="periodStart" value={period.start} />
                <input type="hidden" name="periodEnd" value={period.end} />
                <HoldToConfirm
                  label={t(locale, "review.approve")}
                  holdingLabel={t(locale, "review.approveHold")}
                  confirmMessage={t(locale, "review.approve")}
                />
              </form>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function EntryRow({
  row,
  locale,
  timeZone,
  now,
  jobOptions,
  period,
  strings,
  history,
}: {
  row: Awaited<ReturnType<typeof entriesForOrgRange>>[number];
  locale: "en" | "es";
  timeZone: string;
  now: Date;
  jobOptions: { id: string; name: string }[];
  period: string;
  strings: Parameters<typeof EditSheet>[0]["strings"];
  history: { line: string }[];
}) {
  const { entry, userName, jobName } = row;
  const open = entry.clockOutAt === null;
  const editable: EditableEntry = {
    id: entry.id,
    workerName: userName,
    jobId: entry.jobId,
    clockInLocal: toLocalInput(entry.clockInAt, timeZone),
    clockOutLocal: entry.clockOutAt ? toLocalInput(entry.clockOutAt, timeZone) : null,
    breakMinutes: Math.round(entry.breakSeconds / 60),
    history,
  };

  return (
    <div className="row items-start">
      <span className="dot" data-fence={entry.geofenceStatusIn ?? "unavailable"} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="t-title truncate">{userName}</p>
          <span className="t-data shrink-0">{formatDuration(entrySeconds(entry, now))}</span>
        </div>
        <p className="t-secondary mt-0.5 truncate">
          {formatDayLabel(entry.clockInAt, timeZone, locale)} · {jobName} ·{" "}
          {open
            ? t(locale, "hours.entryOpen", {
                start: formatClockTime(entry.clockInAt, timeZone, locale),
              })
            : t(locale, "hours.entry", {
                start: formatClockTime(entry.clockInAt, timeZone, locale),
                end: formatClockTime(entry.clockOutAt!, timeZone, locale),
              })}
        </p>
        {entry.flags.length > 0 || open ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {open ? (
              <span className="pill" data-tone="warn">
                <span className="dot" />
                {t(locale, "review.openEntry")}
              </span>
            ) : null}
            {entry.flags.map((flag) => (
              <span
                key={flag}
                className="pill"
                data-tone={
                  flag === "outside_fence" || flag === "stale_open"
                    ? "warn"
                    : flag === "implausible_speed" || flag === "shared_device"
                      ? "bad"
                      : undefined
                }
              >
                <FenceIcon
                  status={
                    flag === "outside_fence"
                      ? "outside"
                      : flag === "no_gps" || flag === "low_accuracy"
                        ? "unavailable"
                        : "inside"
                  }
                  size={14}
                />
                {t(locale, `flag.${flag}` as "flag.edited")}
              </span>
            ))}
            {entry.approvedAt ? (
              <span className="pill" data-tone="on">
                <span className="dot" />
                {t(locale, "review.approved", { when: "" }).trim()}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">
        <EditSheet entry={editable} jobs={jobOptions} period={period} strings={strings} />
      </div>
    </div>
  );
}
