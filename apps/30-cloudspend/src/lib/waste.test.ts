import assert from "node:assert/strict";
import test from "node:test";
import {
  kindLabel,
  planMerge,
  rankFindings,
  recoverableMicros,
  recoveredMicros,
  TOP_N,
} from "./waste";
import type { WasteKind, WasteStatus } from "@/db/schema";

const f = (
  resourceKey: string,
  saving: number,
  status: WasteStatus = "open",
  kind: WasteKind = "oversized",
) => ({ resourceKey, kind, estMonthlySavingMicros: saving, status });

test("the report is dollar-ranked and capped at ten", () => {
  const many = Array.from({ length: 14 }, (_, i) => f(`r${i}`, (i + 1) * 1_000_000));
  const ranked = rankFindings(many);
  assert.equal(ranked.length, TOP_N);
  assert.equal(ranked[0].estMonthlySavingMicros, 14_000_000);
  assert.equal(ranked[9].estMonthlySavingMicros, 5_000_000);
});

test("actioned and dismissed findings leave the report", () => {
  const findings = [f("a", 500), f("b", 400, "done"), f("c", 300, "dismissed")];
  assert.deepEqual(rankFindings(findings).map((x) => x.resourceKey), ["a"]);
});

test("the recoverable total rolls down as items are actioned", () => {
  const before = [f("a", 611_000_000), f("b", 438_000_000), f("c", 196_000_000)];
  assert.equal(recoverableMicros(before), 1_245_000_000);
  const after = [f("a", 611_000_000), f("b", 438_000_000, "done"), f("c", 196_000_000)];
  assert.equal(recoverableMicros(after), 807_000_000);
  assert.equal(recoveredMicros(after), 438_000_000);
});

test("kind labels cover every kind", () => {
  assert.equal(kindLabel("idle_instance"), "Idle");
  assert.equal(kindLabel("unattached_ebs"), "Unattached");
  assert.equal(kindLabel("old_snapshot"), "Stale");
  assert.equal(kindLabel("oversized"), "Oversized");
});

/* ----------------------------------------------------------- rescan merge */

test("a rescan inserts new findings and refreshes open ones", () => {
  const stored = [f("a", 100, "open", "idle_instance")];
  const scanned = [
    { resourceKey: "a", kind: "idle_instance" as WasteKind, estMonthlySavingMicros: 150 },
    { resourceKey: "b", kind: "unattached_ebs" as WasteKind, estMonthlySavingMicros: 90 },
  ];
  const plan = planMerge(stored, scanned);
  assert.deepEqual(plan.insert.map((x) => x.resourceKey), ["b"]);
  assert.deepEqual(plan.update.map((x) => x.resourceKey), ["a"]);
  assert.deepEqual(plan.close, []);
});

test("a finding the customer already actioned does not reopen on the next scan", () => {
  // Cloud deletes are eventually consistent: the resource can still show up.
  const stored = [f("a", 100, "done", "idle_instance")];
  const scanned = [
    { resourceKey: "a", kind: "idle_instance" as WasteKind, estMonthlySavingMicros: 100 },
  ];
  const plan = planMerge(stored, scanned);
  assert.deepEqual(plan.insert, []);
  assert.deepEqual(plan.update, []);
  assert.deepEqual(plan.unchanged, ["idle_instance:a"]);
});

test("a finding that vanished from the scan is closed, not left open forever", () => {
  const stored = [f("a", 100, "open", "idle_instance"), f("b", 50, "open", "old_snapshot")];
  const scanned = [
    { resourceKey: "b", kind: "old_snapshot" as WasteKind, estMonthlySavingMicros: 50 },
  ];
  const plan = planMerge(stored, scanned);
  assert.deepEqual(plan.close, ["idle_instance:a"]);
});

test("the same resource key under two kinds is two findings", () => {
  const stored = [f("vol-1", 100, "open", "unattached_ebs")];
  const scanned = [
    { resourceKey: "vol-1", kind: "unattached_ebs" as WasteKind, estMonthlySavingMicros: 100 },
    { resourceKey: "vol-1", kind: "old_snapshot" as WasteKind, estMonthlySavingMicros: 20 },
  ];
  const plan = planMerge(stored, scanned);
  assert.equal(plan.insert.length, 1);
  assert.equal(plan.insert[0].kind, "old_snapshot");
  assert.equal(plan.close.length, 0);
});
