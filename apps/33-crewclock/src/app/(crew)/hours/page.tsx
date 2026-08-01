import type { Metadata } from "next";
import { requireCrew } from "@/lib/auth";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { FenceIcon } from "@/components/icons";
import { formatClockTime, formatDayLabel, t } from "@/lib/i18n";
import { addDaysToDateKey, formatDuration, localDateKey, weekStartKey } from "@/lib/time";
import { entriesForUserRange, entrySeconds } from "@/lib/time-entries";

export const metadata: Metadata = { title: "My hours" };
export const dynamic = "force-dynamic";

/**
 * The crew's own hours, read-only. A worker seeing exactly what the office sees
 * is the privacy promise in practice (README Key Risk 2) — including the fence
 * verdict on every punch, not a sanitised version of it.
 */
export default async function HoursPage() {
  const { user, org } = await requireCrew();
  const locale = user.locale;
  const now = new Date();
  const timeZone = org.timezone;

  const weekStart = weekStartKey(now, timeZone, org.weekStartsOn);
  const entries = await entriesForUserRange(
    user.id,
    weekStart,
    addDaysToDateKey(weekStart, 6),
    timeZone,
  );

  const db = getDb();
  const jobRows = await db
    .select({ id: jobs.id, name: jobs.name })
    .from(jobs)
    .where(eq(jobs.organizationId, org.id));
  const jobName = new Map(jobRows.map((j) => [j.id, j.name]));

  const weekSeconds = entries.reduce((sum, e) => sum + entrySeconds(e, now), 0);

  return (
    <main className="screen screen-crew">
      <header className="pt-6 pb-5">
        <p className="t-label">{t(locale, "hours.weekTotal")}</p>
        <p className="t-stat mt-1">{formatDuration(weekSeconds)}</p>
        <p className="t-secondary mt-1">{t(locale, "hours.readOnly")}</p>
      </header>

      {entries.length === 0 ? (
        <section className="panel p-5">
          <p className="t-title">{t(locale, "hours.empty")}</p>
          <p className="t-secondary mt-2">{t(locale, "hours.emptyHelp")}</p>
        </section>
      ) : (
        <section className="stagger">
          {entries.map((entry) => {
            const seconds = entrySeconds(entry, now);
            const open = entry.clockOutAt === null;
            return (
              <div key={entry.id} className="row">
                <span className="dot" data-fence={entry.geofenceStatusIn ?? "unavailable"} />
                <div className="min-w-0 flex-1">
                  <p className="t-title truncate">
                    {formatDayLabel(entry.clockInAt, timeZone, locale)} ·{" "}
                    {jobName.get(entry.jobId) ?? t(locale, "common.job")}
                  </p>
                  <p className="t-secondary mt-0.5">
                    {open
                      ? t(locale, "hours.entryOpen", {
                          start: formatClockTime(entry.clockInAt, timeZone, locale),
                        })
                      : t(locale, "hours.entry", {
                          start: formatClockTime(entry.clockInAt, timeZone, locale),
                          end: formatClockTime(entry.clockOutAt!, timeZone, locale),
                        })}
                    {entry.breakSeconds > 0
                      ? ` · ${t(locale, "clock.break.total", {
                          duration: formatDuration(entry.breakSeconds),
                        })}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {entry.geofenceStatusIn && entry.geofenceStatusIn !== "inside" ? (
                    <span
                      style={{
                        color:
                          entry.geofenceStatusIn === "outside" ? "var(--warn)" : "var(--fg-3)",
                      }}
                      title={t(
                        locale,
                        entry.geofenceStatusIn === "outside" ? "fence.outside" : "fence.unavailable",
                      )}
                    >
                      <FenceIcon status={entry.geofenceStatusIn} size={18} />
                    </span>
                  ) : null}
                  <span className="t-data">{formatDuration(seconds)}</span>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {entries.some((e) => e.clockOutAt === null) ? (
        <p className="t-secondary mt-4" style={{ color: "var(--accent)" }}>
          {t(locale, "hours.stillOnClock")}
        </p>
      ) : null}
    </main>
  );
}
