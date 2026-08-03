import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DEFAULT_OFFSETS,
  digestSubject,
  digestText,
  planFanOut,
  readAlwaysNotifyCoordinator,
  readOffsets,
  remindersOutlook,
  rungLabel,
  selectOffset,
  type DueDateInput,
  type PartyInput,
} from "@/lib/reminder-rules";

const OFFSETS = [...DEFAULT_OFFSETS];
const TODAY = "2026-06-01";

/* ----------------------------------------------------------- rung selection */

test("each rung fires once, on the tightest crossed threshold", () => {
  // A date 10 days out, walked forward day by day with a growing ledger.
  const dueOn = "2026-06-11";
  const sent: number[] = [];
  const fired: Array<[string, number]> = [];
  for (let d = 0; d <= 12; d += 1) {
    const today = `2026-06-${String(1 + d).padStart(2, "0")}`;
    const offset = selectOffset(dueOn, today, OFFSETS, sent);
    if (offset !== null) {
      fired.push([today, offset]);
      sent.push(offset);
    }
  }
  assert.deepEqual(fired, [
    ["2026-06-04", 7],
    ["2026-06-08", 3],
    ["2026-06-10", 1],
  ]);
});

test("a file opened two days out still gets T-3 and T-1, not silence", () => {
  // The classic ladder bug: selecting the LOOSEST crossed rung fires T-7 on the
  // first pass and then goes quiet forever, because 3 and 1 have "already been
  // passed". Selecting the tightest gives the two warnings that are still
  // meaningful, and skips the seven-day one that is simply too late.
  const dueOn = "2026-06-03";
  const sent: number[] = [];
  const fired: number[] = [];
  for (let d = 1; d <= 5; d += 1) {
    const today = `2026-06-0${d}`;
    const offset = selectOffset(dueOn, today, OFFSETS, sent);
    if (offset !== null) {
      fired.push(offset);
      sent.push(offset);
    }
  }
  assert.deepEqual(fired, [3, 1]);
  assert.equal(fired.includes(7), false, "a seven-day warning two days out is noise");
});

test("nothing fires once the date has passed, forever", () => {
  for (let d = 1; d <= 400; d += 1) {
    const today = `2026-06-01`;
    const dueOn = "2026-05-01";
    assert.equal(selectOffset(dueOn, today, OFFSETS, []), null);
    // And with the whole ladder already sent, still nothing.
    assert.equal(selectOffset(dueOn, today, OFFSETS, [7, 3, 1]), null);
    if (d > 3) break;
  }
  // A year later: still silent.
  assert.equal(selectOffset("2026-05-01", "2027-05-01", OFFSETS, []), null);
});

test("a rung already in the ledger never fires again", () => {
  assert.equal(selectOffset("2026-06-04", TODAY, OFFSETS, [3]), null);
  assert.equal(selectOffset("2026-06-02", TODAY, OFFSETS, [3]), 1);
  assert.equal(selectOffset("2026-06-02", TODAY, OFFSETS, [3, 1]), null);
});

test("the due day itself still gets its tightest rung if nothing was sent", () => {
  assert.equal(selectOffset(TODAY, TODAY, OFFSETS, []), 1);
  assert.equal(selectOffset(TODAY, TODAY, OFFSETS, [1]), null);
});

test("a date beyond the widest rung is silent, not early", () => {
  assert.equal(selectOffset("2026-06-30", TODAY, OFFSETS, []), null);
  assert.equal(selectOffset("2026-06-09", TODAY, OFFSETS, []), null);
  assert.equal(selectOffset("2026-06-08", TODAY, OFFSETS, []), 7);
});

test("custom offsets are honoured, sorted and sanitised", () => {
  assert.deepEqual(readOffsets({ reminderOffsets: [1, 14, 3] }), [14, 3, 1]);
  assert.deepEqual(readOffsets({ reminderOffsets: [3, 3, 3] }), [3]);
  assert.deepEqual(readOffsets({ reminderOffsets: [] }), [7, 3, 1]);
  assert.deepEqual(readOffsets({ reminderOffsets: ["7", -2, 1000, 5] }), [5]);
  assert.deepEqual(readOffsets(null), [7, 3, 1]);
  assert.deepEqual(readOffsets({}), [7, 3, 1]);
  assert.equal(selectOffset("2026-06-15", TODAY, [14, 3, 1], []), 14);
});

test("coordinator notification defaults on but can be turned off", () => {
  assert.equal(readAlwaysNotifyCoordinator({}), true);
  assert.equal(readAlwaysNotifyCoordinator(null), true);
  assert.equal(readAlwaysNotifyCoordinator({ alwaysNotifyCoordinator: false }), false);
  assert.equal(readAlwaysNotifyCoordinator({ alwaysNotifyCoordinator: "yes" }), false);
});

/* --------------------------------------------------------------- the fan-out */

function date(over: Partial<DueDateInput> = {}): DueDateInput {
  return {
    criticalDateId: "cd-1",
    dealId: "deal-1",
    dealAddress: "412 Pecan Grove Ln",
    key: "inspection_objection",
    label: "Inspection objection deadline",
    dueOn: "2026-06-04",
    status: "upcoming",
    ownerRole: "buyer_agent",
    sentence: "Contract date (May 20) + 10 business days — lands Thursday, Jun 4.",
    sentOffsets: [],
    ...over,
  };
}

const PARTIES: PartyInput[] = [
  { id: "p-buyer", dealId: "deal-1", role: "buyer", name: "Dana Okafor", email: "dana@example.com", notify: true },
  {
    id: "p-agent",
    dealId: "deal-1",
    role: "buyer_agent",
    name: "Marisol Vance",
    email: "marisol@example.com",
    notify: true,
  },
  { id: "p-tc", dealId: "deal-1", role: "tc", name: "Rita Bell", email: "rita@example.com", notify: true },
  { id: "p-lender", dealId: "deal-1", role: "lender", name: "Sam Ozturk", email: null, notify: true },
  {
    id: "p-quiet",
    dealId: "deal-1",
    role: "buyer_agent",
    name: "Assistant",
    email: "assistant@example.com",
    notify: false,
  },
];

test("a date goes to its owning role, plus the coordinator", () => {
  const plan = planFanOut([date()], PARTIES, TODAY, OFFSETS, true);
  assert.deepEqual(plan.rungs, [
    { criticalDateId: "cd-1", offsetDays: 3, dueOn: "2026-06-04", label: "Inspection objection deadline" },
  ]);
  assert.deepEqual(plan.digests.map((d) => d.partyId).sort(), ["p-agent", "p-tc"]);
  assert.equal(plan.unaddressed.length, 0);
});

test("notify=false is respected, and a party with no email is skipped", () => {
  const plan = planFanOut([date()], PARTIES, TODAY, OFFSETS, true);
  const ids = plan.digests.map((d) => d.partyId);
  assert.equal(ids.includes("p-quiet"), false);
  const lender = planFanOut([date({ ownerRole: "lender" })], PARTIES, TODAY, OFFSETS, false);
  assert.deepEqual(lender.digests, [], "no email address, no digest");
  assert.deepEqual(lender.unaddressed, [
    { criticalDateId: "cd-1", label: "Inspection objection deadline", ownerRole: "lender" },
  ]);
  // The rung is still claimed, so the pass is not retried tomorrow forever.
  assert.equal(lender.rungs.length, 1);
});

test("three dates on one party on one day become one email with three sections", () => {
  const plan = planFanOut(
    [
      date({ criticalDateId: "cd-1", label: "Inspection objection deadline", dueOn: "2026-06-04" }),
      date({ criticalDateId: "cd-2", label: "Appraisal received", dueOn: "2026-06-02", ownerRole: "buyer_agent" }),
      date({ criticalDateId: "cd-3", label: "HOA documents delivered", dueOn: "2026-06-03", ownerRole: "buyer_agent" }),
    ],
    PARTIES,
    TODAY,
    OFFSETS,
    false,
  );
  assert.equal(plan.digests.length, 1, "one email per party per pass");
  const [digest] = plan.digests;
  assert.equal(digest.partyId, "p-agent");
  assert.equal(digest.sections.length, 3);
  assert.deepEqual(
    digest.sections.map((s) => s.dueOn),
    ["2026-06-02", "2026-06-03", "2026-06-04"],
    "soonest first",
  );
  // One ledger row per date, at its own rung.
  assert.deepEqual(
    plan.rungs.map((r) => [r.criticalDateId, r.offsetDays]).sort(),
    [
      ["cd-1", 3],
      ["cd-2", 1],
      ["cd-3", 3],
    ],
  );
});

test("met and waived dates never fan out", () => {
  const plan = planFanOut(
    [date({ status: "met" }), date({ criticalDateId: "cd-2", status: "waived" })],
    PARTIES,
    TODAY,
    OFFSETS,
    true,
  );
  assert.deepEqual(plan.rungs, []);
  assert.deepEqual(plan.digests, []);
});

test("a date with no computed due date is not a reminder", () => {
  const plan = planFanOut([date({ dueOn: null })], PARTIES, TODAY, OFFSETS, true);
  assert.deepEqual(plan.rungs, []);
});

test("dates on other deals never leak into this deal's parties", () => {
  const plan = planFanOut(
    [date({ dealId: "deal-2", dealAddress: "9 Anselmo Ct" })],
    PARTIES,
    TODAY,
    OFFSETS,
    true,
  );
  assert.deepEqual(plan.digests, [], "deal-2 has no parties loaded");
  assert.equal(plan.unaddressed.length, 1);
});

test("running the same pass twice sends nothing the second time", () => {
  const first = planFanOut([date()], PARTIES, TODAY, OFFSETS, true);
  const claimed = first.rungs.map((r) => r.offsetDays);
  const second = planFanOut([date({ sentOffsets: claimed })], PARTIES, TODAY, OFFSETS, true);
  assert.deepEqual(second.rungs, []);
  assert.deepEqual(second.digests, []);
});

/* --------------------------------------------------------------- the copy */

test("the subject names the date and how far off it is", () => {
  const plan = planFanOut([date()], PARTIES, TODAY, OFFSETS, false);
  const subject = digestSubject(plan.digests[0], TODAY);
  assert.equal(subject, "Inspection objection deadline — in 3 days (412 Pecan Grove Ln)");
});

test("a multi-date subject counts them and leads with the soonest", () => {
  const plan = planFanOut(
    [date(), date({ criticalDateId: "cd-2", label: "Appraisal received", dueOn: "2026-06-02" })],
    PARTIES,
    TODAY,
    OFFSETS,
    false,
  );
  assert.equal(
    digestSubject(plan.digests[0], TODAY),
    "2 dates coming up — next tomorrow (412 Pecan Grove Ln)",
  );
});

test("the body carries the derivation sentence for every date", () => {
  const plan = planFanOut([date()], PARTIES, TODAY, OFFSETS, false);
  const body = digestText(plan.digests[0], TODAY, "https://example.test/p/abc");
  assert.match(body, /^Marisol Vance,/);
  assert.match(body, /Inspection objection deadline/);
  assert.match(body, /Jun 4, 2026 — in 3 days/);
  assert.match(body, /How this date was computed: Contract date \(May 20\) \+ 10 business days/);
  assert.match(body, /https:\/\/example\.test\/p\/abc/);
  // No portal link when the party has no portal.
  assert.equal(digestText(plan.digests[0], TODAY, null).includes("Everything on the file"), false);
});

test("rungs are named the way the ledger shows them", () => {
  assert.equal(rungLabel(7), "T-7");
  assert.equal(rungLabel(1), "T-1");
  assert.equal(rungLabel(0), "on the day");
});

test("a moved date says which reminders already went and which remain", () => {
  // Nothing sent yet: the full ladder is ahead.
  assert.equal(
    remindersOutlook([], "2026-07-06", TODAY, OFFSETS),
    "T-7, T-3 and T-1 still to fire — the next when it comes due.",
  );
  // Two rungs spent on the old date: the coordinator is told, not surprised.
  assert.equal(
    remindersOutlook([7, 3], "2026-07-06", TODAY, OFFSETS),
    "T-7 and T-3 already went out for the old date. T-1 still to fire — the next when it comes due.",
  );
  // The one case the append-only ledger cannot cover is stated outright.
  assert.equal(
    remindersOutlook([7, 3, 1], "2026-07-06", TODAY, OFFSETS),
    "T-7, T-3 and T-1 already went out for the old date. Every reminder for this date has been used — nothing further will fire.",
  );
  // A date moved into the past fires nothing, and says so.
  assert.match(remindersOutlook([7], "2026-05-01", TODAY, OFFSETS), /new date is in the past/);
  // A date that stopped being computable.
  assert.match(remindersOutlook([], null, TODAY, OFFSETS), /No reminders have gone out/);
  assert.match(remindersOutlook([3], null, TODAY, OFFSETS), /nothing further fires until/);
});
