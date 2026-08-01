/**
 * The PDF encoder guard. This exists because the real thing crashed: pdf-lib's
 * standard fonts throw on any character outside WinAnsi, and a single arrow in
 * the bulk-export header took the whole records export down. An archive that
 * refuses to render is worse than one that renders a "?".
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { winAnsi } from "@/lib/pdf";

describe("winAnsi", () => {
  it("passes plain text and accented Latin through untouched", () => {
    assert.equal(winAnsi("Zoë Nguyen — 303 555 0117"), "Zoë Nguyen — 303 555 0117");
    assert.equal(winAnsi("Señor O'Brien"), "Señor O'Brien");
    assert.equal(winAnsi("“quoted” · dashed – ellipsis…"), "“quoted” - dashed – ellipsis…");
  });

  it("maps the symbols that turn up in pasted clauses", () => {
    assert.equal(winAnsi("2026-01-01 → 2026-12-31"), "2026-01-01 -> 2026-12-31");
    assert.equal(winAnsi("weight ≥ 30kg"), "weight >= 30kg");
    assert.equal(winAnsi("• bullet"), "- bullet");
  });

  it("never throws on characters outside the encoding", () => {
    assert.equal(winAnsi("李"), "?");
    assert.equal(winAnsi("Ana 🧗 Torres"), "Ana ? Torres");
  });

  it("keeps newlines and tabs, which the layout depends on", () => {
    assert.equal(winAnsi("line one\nline two\tcol"), "line one\nline two\tcol");
  });
});
