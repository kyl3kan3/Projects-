/**
 * The conflict checker — the product's headline feature, and deliberately pure.
 *
 * No database, no Next.js, no clock of its own: it takes a list of scheduled
 * entries whose times are already instants and returns findings. That makes the
 * boundary cases unit-testable (they are, in conflicts.test.ts), and it lets the
 * same engine serve the console's publish gate and the free CSV checker without
 * a second implementation to keep in step.
 *
 * The four kinds, and why each has the severity it has:
 *
 *   HARD `field_overlap`      Two things on one patch of grass. Physically
 *                             impossible; publishing it sends parents to a field
 *                             that is already occupied.
 *   HARD `team_double_booked` One team in two places. Same impossibility.
 *   SOFT `coach_overlap`      One coach on two teams at once. Common and
 *                             sometimes intended — an assistant covers one — so
 *                             it is flagged for an explicit override, not blocked.
 *   SOFT `sibling_overlap`    One household with children playing at the same
 *                             time in different divisions. One parent, two
 *                             fields: worth knowing, not worth blocking.
 *
 * The overlap rule is `intervalsOverlap` from lib/time: half-open intervals, so
 * back-to-back is clean and one minute of overlap is a conflict.
 */

import type { ConflictKind, ConflictSeverity, GameKind } from "@/db/schema";
import {
  formatClock,
  formatDayLabel,
  intervalsOverlap,
  overlapMinutes,
} from "@/lib/time";

/** One thing on the calendar, with everyone it ties up. */
export interface ScheduleEntry {
  id: string;
  kind: GameKind;
  divisionId: string;
  divisionName: string;
  /** Home first, then away when there is one. Practices have a single team. */
  teams: { id: string; name: string }[];
  /** Coaches and managers assigned to the participating teams. */
  coaches: { id: string; name: string }[];
  /** Households with a rostered child on the participating teams. */
  households: { id: string; label: string }[];
  venueId: string;
  venueName: string;
  field: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ConflictFinding {
  severity: ConflictSeverity;
  kind: ConflictKind;
  /** Sorted, so the same clash always produces the same fingerprint. */
  gameIds: string[];
  explanation: string;
  fingerprint: string;
}

function fingerprintOf(kind: ConflictKind, gameIds: string[], discriminator = ""): string {
  return `${kind}:${[...gameIds].sort().join(",")}${discriminator ? `:${discriminator}` : ""}`;
}

function windowLabel(a: ScheduleEntry, b: ScheduleEntry, timeZone: string): string {
  const first = a.startsAt <= b.startsAt ? a : b;
  const second = first === a ? b : a;
  const day = formatDayLabel(first.startsAt, timeZone);
  const sameDay = formatDayLabel(second.startsAt, timeZone) === day;
  return sameDay
    ? `${day} ${formatClock(first.startsAt, timeZone)}–${formatClock(second.endsAt, timeZone)}`
    : `${day} ${formatClock(first.startsAt, timeZone)}`;
}

function matchup(entry: ScheduleEntry): string {
  if (entry.teams.length >= 2) return `${entry.teams[0].name} v ${entry.teams[1].name}`;
  const label = entry.kind === "practice" ? "practice" : entry.kind === "event" ? "event" : "game";
  return `${entry.teams[0]?.name ?? "Unassigned"} ${label}`;
}

/**
 * Find every conflict among `entries`.
 *
 * A sweep, not a double loop: entries are sorted by start, and each is compared
 * only against the ones that begin before it ends. A 40-team season is a few
 * hundred games and this stays well under a millisecond, which matters because
 * the checker runs on every single edit — a checker you wait for is a checker
 * that gets turned off.
 */
export function detectConflicts(
  entries: readonly ScheduleEntry[],
  timeZone: string,
): ConflictFinding[] {
  const sorted = [...entries].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const findings: ConflictFinding[] = [];
  const seen = new Set<string>();

  const push = (finding: ConflictFinding) => {
    if (seen.has(finding.fingerprint)) return;
    seen.add(finding.fingerprint);
    findings.push(finding);
  };

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      // Sorted by start: once b begins at or after a ends, so does everything
      // after it. Nothing later can overlap a.
      if (b.startsAt.getTime() >= a.endsAt.getTime()) break;
      if (!intervalsOverlap(a.startsAt, a.endsAt, b.startsAt, b.endsAt)) continue;

      const ids = [a.id, b.id];
      const minutes = overlapMinutes(a.startsAt, a.endsAt, b.startsAt, b.endsAt);
      const when = windowLabel(a, b, timeZone);

      // --- HARD: the same field at the same time ---------------------------
      if (a.venueId === b.venueId && a.field === b.field) {
        push({
          severity: "hard",
          kind: "field_overlap",
          gameIds: ids,
          explanation:
            `${a.venueName} · ${a.field} is booked twice, ${when}` +
            ` — ${matchup(a)} and ${matchup(b)} overlap by ${minutes} min`,
          fingerprint: fingerprintOf("field_overlap", ids),
        });
      }

      // --- HARD: one team in two places -----------------------------------
      const sharedTeams = a.teams.filter((t) => b.teams.some((o) => o.id === t.id));
      for (const team of sharedTeams) {
        push({
          severity: "hard",
          kind: "team_double_booked",
          gameIds: ids,
          explanation:
            `${team.name} is booked twice, ${when}` +
            ` — ${matchup(a)} and ${matchup(b)} overlap by ${minutes} min`,
          fingerprint: fingerprintOf("team_double_booked", ids, team.id),
        });
      }

      // --- SOFT: one coach, two teams -------------------------------------
      if (sharedTeams.length === 0) {
        const sharedCoaches = a.coaches.filter((c) => b.coaches.some((o) => o.id === c.id));
        for (const coach of sharedCoaches) {
          push({
            severity: "soft",
            kind: "coach_overlap",
            gameIds: ids,
            explanation:
              `${coach.name} is needed by ${a.divisionName} and ${b.divisionName} at once, ${when}`,
            fingerprint: fingerprintOf("coach_overlap", ids, coach.id),
          });
        }

        // --- SOFT: one household, two children on at once -----------------
        const sharedHouseholds = a.households.filter((h) =>
          b.households.some((o) => o.id === h.id),
        );
        for (const household of sharedHouseholds) {
          push({
            severity: "soft",
            kind: "sibling_overlap",
            gameIds: ids,
            explanation:
              `${household.label} has children in ${a.divisionName} and ${b.divisionName} at once, ${when}` +
              ` — ${a.venueName} · ${a.field} and ${b.venueName} · ${b.field}`,
            fingerprint: fingerprintOf("sibling_overlap", ids, household.id),
          });
        }
      }
    }
  }

  // Hard first, then soft; within a severity, earliest clash first.
  return findings.sort((x, y) => {
    if (x.severity !== y.severity) return x.severity === "hard" ? -1 : 1;
    return x.explanation.localeCompare(y.explanation);
  });
}

export function hardConflicts(findings: readonly ConflictFinding[]): ConflictFinding[] {
  return findings.filter((f) => f.severity === "hard");
}

export function softConflicts(findings: readonly ConflictFinding[]): ConflictFinding[] {
  return findings.filter((f) => f.severity === "soft");
}

/** The Label text inside a pennant chip. */
export function conflictLabel(kind: ConflictKind): string {
  switch (kind) {
    case "field_overlap":
      return "FIELD OVERLAP";
    case "team_double_booked":
      return "TEAM TWICE";
    case "coach_overlap":
      return "COACH OVERLAP";
    case "sibling_overlap":
      return "SIBLING OVERLAP";
  }
}

/**
 * Whether a publish may proceed.
 *
 * Hard conflicts block outright. Soft conflicts block only until a registrar has
 * explicitly overridden each one — the point of the gate is that nobody emails a
 * broken schedule *by accident*, not that a club can never make a judgement call.
 */
export function publishGate(
  findings: readonly ConflictFinding[],
  overriddenFingerprints: readonly string[],
): { ok: boolean; blockedBy: ConflictFinding[]; needsOverride: ConflictFinding[] } {
  const overridden = new Set(overriddenFingerprints);
  const blockedBy = findings.filter((f) => f.severity === "hard");
  const needsOverride = findings.filter(
    (f) => f.severity === "soft" && !overridden.has(f.fingerprint),
  );
  return { ok: blockedBy.length === 0 && needsOverride.length === 0, blockedBy, needsOverride };
}
