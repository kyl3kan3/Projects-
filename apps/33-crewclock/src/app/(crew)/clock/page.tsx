import type { Metadata } from "next";
import { requireCrew, isOffice } from "@/lib/auth";
import { activeJobs, jobsForCrew } from "@/lib/jobs";
import { formatClockTime, t } from "@/lib/i18n";
import {
  addDaysToDateKey,
  localDateKey,
  weekStartKey,
} from "@/lib/time";
import { entriesForUserRange, entrySeconds, openEntryFor } from "@/lib/time-entries";
import { ClockFace, type ClockJob } from "./ClockFace";

export const metadata: Metadata = { title: "Clock" };
// A time clock must never be served from a cache.
export const dynamic = "force-dynamic";

export default async function ClockPage() {
  const { user, org } = await requireCrew();
  const locale = user.locale;
  const now = new Date();
  const timeZone = org.timezone;

  // Crew punch into what they are assigned to; the owner punches into anything
  // active, because on a five-person crew the owner is on the tools too.
  const assigned = isOffice(user.role) ? await activeJobs(org.id) : await jobsForCrew(user.id);
  const jobs: ClockJob[] = assigned.map(({ job, site }) => ({
    id: job.id,
    name: job.name,
    siteLabel: site?.label ?? null,
    radiusM: site?.radiusM ?? null,
  }));

  const open = await openEntryFor(user.id);

  const todayKey = localDateKey(now, timeZone);
  const weekStart = weekStartKey(now, timeZone, org.weekStartsOn);
  const todayEntries = await entriesForUserRange(user.id, todayKey, todayKey, timeZone);
  const weekEntries = await entriesForUserRange(
    user.id,
    weekStart,
    addDaysToDateKey(weekStart, 6),
    timeZone,
  );
  const todaySeconds = todayEntries.reduce((sum, e) => sum + entrySeconds(e, now), 0);
  const weekSeconds = weekEntries.reduce((sum, e) => sum + entrySeconds(e, now), 0);

  return (
    <ClockFace
      jobs={jobs}
      open={
        open
          ? {
              id: open.id,
              jobId: open.jobId,
              clockInAtIso: open.clockInAt.toISOString(),
              breakSeconds: open.breakSeconds,
              breakStartedAtIso: open.breakStartedAt?.toISOString() ?? null,
              fenceStatus: open.geofenceStatusIn,
              distanceM: open.inDistanceM,
            }
          : null
      }
      todaySeconds={todaySeconds}
      weekSeconds={weekSeconds}
      clockTimeLabel={open ? formatClockTime(open.clockInAt, timeZone, locale) : null}
      strings={{
        in: t(locale, "clock.in"),
        out: t(locale, "clock.out"),
        punching: t(locale, "clock.punching"),
        onTheClock: t(locale, "clock.onTheClock"),
        off: t(locale, "clock.off"),
        onBreak: t(locale, "clock.onBreak"),
        shift: t(locale, "clock.shift"),
        startedAt: t(locale, "clock.startedAt"),
        breakStart: t(locale, "clock.break.start"),
        breakEnd: t(locale, "clock.break.end"),
        pickJob: t(locale, "clock.pickJob"),
        noJobs: t(locale, "clock.noJobs"),
        noJobsHelp: t(locale, "clock.noJobsHelp"),
        locating: t(locale, "clock.locating"),
        fenceInside: t(locale, "clock.fence.inside"),
        fenceOutside: t(locale, "clock.fence.outside"),
        fenceUnavailable: t(locale, "clock.fence.unavailable"),
        fenceLowAccuracy: t(locale, "clock.fence.lowAccuracy"),
        fenceNoSite: t(locale, "clock.fence.noSite"),
        fenceRadius: t(locale, "sites.radius"),
        savedOnPhone: t(locale, "clock.savedOnPhone"),
        queuedOne: t(locale, "clock.queued.one"),
        queuedMany: t(locale, "clock.queued.many"),
        syncNow: t(locale, "clock.syncNow"),
        today: t(locale, "clock.todayTotal"),
        week: t(locale, "clock.weekTotal"),
        confirmIn: t(locale, "clock.confirmInShort"),
        confirmOut: t(locale, "clock.confirmOut"),
        retry: t(locale, "common.retry"),
      }}
    />
  );
}
