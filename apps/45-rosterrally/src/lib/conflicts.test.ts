/**
 * The conflict checker's boundary cases, by hand.
 *
 * These are the tests the product is sold on. A checker that flags back-to-back
 * games is worse than no checker, and a checker that misses a one-minute overlap
 * is a schedule disaster with extra steps. Both directions are pinned here, along
 * with the two timezone traps: two clubs' wall clocks that mean the same instant,
 * and the fall-back Sunday where 01:30 happens twice.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  detectConflicts,
  hardConflicts,
  publishGate,
  softConflicts,
  type ScheduleEntry,
} from "./conflicts";
import { addDays, intervalsOverlap, overlapMinutes, wallTimeToInstant, zoneOffsetMs } from "./time";

const TZ = "America/New_York";

function entry(over: Partial<ScheduleEntry> & Pick<ScheduleEntry, "id">): ScheduleEntry {
  return {
    kind: "game",
    divisionId: "d-u10b",
    divisionName: "U10 Boys",
    teams: [{ id: "t-thunder", name: "Thunder" }],
    coaches: [],
    households: [],
    venueId: "v-miller",
    venueName: "Miller Park",
    field: "Field 2",
    startsAt: wallTimeToInstant("2026-09-12", "09:00", TZ),
    endsAt: wallTimeToInstant("2026-09-12", "10:30", TZ),
    ...over,
  };
}

/** Same wall time, different day/time, in the club's zone. */
function at(date: string, time: string, minutes: number): { startsAt: Date; endsAt: Date } {
  const startsAt = wallTimeToInstant(date, time, TZ);
  return { startsAt, endsAt: new Date(startsAt.getTime() + minutes * 60_000) };
}

test("back-to-back on one field is not a conflict", () => {
  const a = entry({ id: "g1", ...at("2026-09-12", "09:00", 90) });
  const b = entry({
    id: "g2",
    teams: [{ id: "t-rapids", name: "Rapids" }],
    ...at("2026-09-12", "10:30", 90),
  });
  assert.deepEqual(detectConflicts([a, b], TZ), []);
});

test("one minute of overlap on one field is a hard conflict", () => {
  const a = entry({ id: "g1", ...at("2026-09-12", "09:00", 90) });
  const b = entry({
    id: "g2",
    teams: [{ id: "t-rapids", name: "Rapids" }],
    ...at("2026-09-12", "10:29", 90),
  });
  const found = detectConflicts([a, b], TZ);
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "field_overlap");
  assert.equal(found[0].severity, "hard");
  assert.deepEqual(found[0].gameIds.sort(), ["g1", "g2"]);
  assert.match(found[0].explanation, /Miller Park · Field 2 is booked twice/);
  assert.match(found[0].explanation, /overlap by 1 min/);
});

test("zero-length touch at the same instant is not an overlap", () => {
  const t = wallTimeToInstant("2026-09-12", "09:00", TZ);
  assert.equal(intervalsOverlap(t, t, t, t), false);
  assert.equal(overlapMinutes(t, new Date(t.getTime() + 60_000), t, t), 0);
});

test("different fields at the same venue and time do not clash", () => {
  const a = entry({ id: "g1", field: "Field 1" });
  const b = entry({ id: "g2", field: "Field 2", teams: [{ id: "t-rapids", name: "Rapids" }] });
  assert.deepEqual(detectConflicts([a, b], TZ), []);
});

test("a team booked twice is hard, even at different venues", () => {
  const a = entry({ id: "g1", ...at("2026-09-12", "09:00", 90) });
  const b = entry({
    id: "g2",
    venueId: "v-riverside",
    venueName: "Riverside Complex",
    field: "Field A",
    ...at("2026-09-12", "10:00", 90),
  });
  const found = detectConflicts([a, b], TZ);
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "team_double_booked");
  assert.equal(found[0].severity, "hard");
  assert.match(found[0].explanation, /Thunder is booked twice/);
});

test("a shared coach across two divisions is soft, not hard", () => {
  const coach = { id: "u-dana", name: "Dana Whitfield" };
  const a = entry({ id: "g1", coaches: [coach], ...at("2026-09-12", "09:00", 90) });
  const b = entry({
    id: "g2",
    divisionId: "d-u12b",
    divisionName: "U12 Boys",
    teams: [{ id: "t-rapids", name: "Rapids" }],
    coaches: [coach],
    field: "Field 1",
    ...at("2026-09-12", "10:00", 90),
  });
  const found = detectConflicts([a, b], TZ);
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, "soft");
  assert.equal(found[0].kind, "coach_overlap");
  assert.match(found[0].explanation, /Dana Whitfield is needed by U10 Boys and U12 Boys/);
});

test("siblings playing at once is soft and names the family, not the children", () => {
  const family = { id: "h-alvarez", label: "The Alvarez family" };
  const a = entry({ id: "g1", households: [family], ...at("2026-09-12", "09:00", 90) });
  const b = entry({
    id: "g2",
    divisionId: "d-u12g",
    divisionName: "U12 Girls",
    teams: [{ id: "t-comets", name: "Comets" }],
    households: [family],
    venueId: "v-riverside",
    venueName: "Riverside Complex",
    field: "Field A",
    ...at("2026-09-12", "09:30", 90),
  });
  const found = detectConflicts([a, b], TZ);
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "sibling_overlap");
  assert.equal(found[0].severity, "soft");
  assert.match(found[0].explanation, /The Alvarez family has children in U10 Boys and U12 Girls/);
});

test("a team clash suppresses the coach and sibling noise for the same pair", () => {
  const coach = { id: "u-dana", name: "Dana Whitfield" };
  const family = { id: "h-alvarez", label: "The Alvarez family" };
  const a = entry({ id: "g1", coaches: [coach], households: [family] });
  const b = entry({
    id: "g2",
    coaches: [coach],
    households: [family],
    field: "Field 1",
    ...at("2026-09-12", "09:30", 60),
  });
  const found = detectConflicts([a, b], TZ);
  // Same team twice is the finding a registrar must act on; reporting three
  // separate problems for one mistake is how a conflict list gets ignored.
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "team_double_booked");
});

test("three games on one field report each clashing pair once", () => {
  const a = entry({ id: "g1", ...at("2026-09-12", "09:00", 120) });
  const b = entry({
    id: "g2",
    teams: [{ id: "t-rapids", name: "Rapids" }],
    ...at("2026-09-12", "09:30", 60),
  });
  const c = entry({
    id: "g3",
    teams: [{ id: "t-comets", name: "Comets" }],
    ...at("2026-09-12", "10:15", 60),
  });
  const found = hardConflicts(detectConflicts([a, b, c], TZ));
  assert.equal(found.length, 3); // g1-g2, g1-g3, g2-g3
  const pairs = found.map((f) => [...f.gameIds].sort().join("+")).sort();
  assert.deepEqual(pairs, ["g1+g2", "g1+g3", "g2+g3"]);
});

/* ---------------------------------------------------------- timezone traps --- */

test("two clubs' wall clocks that name the same instant collide", () => {
  // 12:00 in Denver is 14:00 in New York — the same moment. A checker comparing
  // wall-clock strings sees 12 != 14 and lets a double-booked shared venue through.
  const denver = wallTimeToInstant("2026-09-12", "12:00", "America/Denver");
  const newYork = wallTimeToInstant("2026-09-12", "14:00", "America/New_York");
  assert.equal(denver.getTime(), newYork.getTime());

  const a = entry({ id: "g1", startsAt: denver, endsAt: new Date(denver.getTime() + 3_600_000) });
  const b = entry({
    id: "g2",
    teams: [{ id: "t-rapids", name: "Rapids" }],
    startsAt: newYork,
    endsAt: new Date(newYork.getTime() + 3_600_000),
  });
  assert.equal(hardConflicts(detectConflicts([a, b], TZ)).length, 1);
});

test("the fall-back Sunday: 01:30 twice is one instant, 90 minutes apart is not", () => {
  // 2026-11-01, America/New_York: 02:00 EDT becomes 01:00 EST, so 01:30 occurs
  // twice. `wallTimeToInstant` resolves to the FIRST (EDT) occurrence.
  const first = wallTimeToInstant("2026-11-01", "01:30", TZ);
  assert.equal(zoneOffsetMs(first, TZ), -4 * 3_600_000);
  // The second 01:30 is one hour later in real time.
  const second = new Date(first.getTime() + 3_600_000);
  assert.equal(zoneOffsetMs(second, TZ), -5 * 3_600_000);

  // Two 45-minute practices, both typed "01:30", are the same instant: a clash.
  const a = entry({ id: "g1", startsAt: first, endsAt: new Date(first.getTime() + 45 * 60_000) });
  const b = entry({
    id: "g2",
    teams: [{ id: "t-rapids", name: "Rapids" }],
    startsAt: wallTimeToInstant("2026-11-01", "01:30", TZ),
    endsAt: new Date(wallTimeToInstant("2026-11-01", "01:30", TZ).getTime() + 45 * 60_000),
  });
  assert.equal(hardConflicts(detectConflicts([a, b], TZ)).length, 1);

  // The genuinely repeated hour is NOT a clash: 01:30 EDT + 45min ends before
  // 01:30 EST begins, even though both read "01:30" on a wall clock.
  const c = entry({ id: "g3", startsAt: first, endsAt: new Date(first.getTime() + 45 * 60_000) });
  const d = entry({
    id: "g4",
    teams: [{ id: "t-rapids", name: "Rapids" }],
    startsAt: second,
    endsAt: new Date(second.getTime() + 45 * 60_000),
  });
  assert.deepEqual(detectConflicts([c, d], TZ), []);
});

test("spring forward: a 90-minute game across the gap still ends 90 real minutes later", () => {
  // 2026-03-08 02:00 EST -> 03:00 EDT. A 01:30 game of 90 minutes ends at 04:00
  // on the wall clock but occupies only 90 real minutes, so a 04:00 game on the
  // same field is back-to-back and clean.
  const start = wallTimeToInstant("2026-03-08", "01:30", TZ);
  const end = new Date(start.getTime() + 90 * 60_000);
  const next = wallTimeToInstant("2026-03-08", "04:00", TZ);
  assert.equal(end.getTime(), next.getTime());

  const a = entry({ id: "g1", startsAt: start, endsAt: end });
  const b = entry({
    id: "g2",
    teams: [{ id: "t-rapids", name: "Rapids" }],
    startsAt: next,
    endsAt: new Date(next.getTime() + 90 * 60_000),
  });
  assert.deepEqual(detectConflicts([a, b], TZ), []);
});

test("a wall time inside the spring-forward gap is reported as nonexistent", () => {
  // 02:30 on 2026-03-08 does not exist in New York.
  const instant = wallTimeToInstant("2026-03-08", "02:30", TZ);
  const offsetAfter = zoneOffsetMs(instant, TZ);
  assert.equal(offsetAfter, -4 * 3_600_000);
  assert.equal(instant.getTime(), wallTimeToInstant("2026-03-08", "03:30", TZ).getTime());
});

/* -------------------------------------------------------------- the gate --- */

test("the publish gate blocks on hard, waits for an override on soft", () => {
  const hard = entry({ id: "g1" });
  const hardB = entry({ id: "g2", teams: [{ id: "t-rapids", name: "Rapids" }] });
  const findings = detectConflicts([hard, hardB], TZ);
  assert.equal(publishGate(findings, []).ok, false);
  // An override cannot unblock a hard conflict.
  assert.equal(publishGate(findings, findings.map((f) => f.fingerprint)).ok, false);

  const coach = { id: "u-dana", name: "Dana Whitfield" };
  const soft = detectConflicts(
    [
      entry({ id: "g3", coaches: [coach] }),
      entry({
        id: "g4",
        divisionId: "d-u12b",
        divisionName: "U12 Boys",
        teams: [{ id: "t-rapids", name: "Rapids" }],
        coaches: [coach],
        field: "Field 1",
      }),
    ],
    TZ,
  );
  assert.equal(softConflicts(soft).length, 1);
  assert.equal(publishGate(soft, []).ok, false);
  assert.equal(publishGate(soft, [soft[0].fingerprint]).ok, true);
});

test("an empty schedule publishes clean", () => {
  assert.equal(publishGate([], []).ok, true);
});

test("a 40-team season's worth of games checks in well under a second", () => {
  // 40 teams, 10 weeks, ~2 entries per team per week = 800 entries.
  const entries: ScheduleEntry[] = [];
  for (let week = 0; week < 10; week++) {
    for (let team = 0; team < 40; team++) {
      const day = addDays("2026-09-12", week * 7);
      const hour = 8 + (team % 8);
      entries.push(
        entry({
          id: `g-${week}-${team}`,
          teams: [{ id: `t-${team}`, name: `Team ${team}` }],
          venueId: `v-${team % 4}`,
          field: `Field ${(team % 3) + 1}`,
          ...at(day, `${String(hour).padStart(2, "0")}:00`, 90),
        }),
      );
    }
  }
  assert.equal(entries.length, 400);
  const started = Date.now();
  detectConflicts(entries, TZ);
  assert.ok(Date.now() - started < 1000, "conflict check must stay under a second");
});
