import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestPromiseDate } from "@/lib/promises";

// Friday 10 July 2026.
const TODAY = "2026-07-10";

describe("suggestPromiseDate", () => {
  it("reads the phrases people actually use", () => {
    assert.equal(suggestPromiseDate("Paying it today, sorry for the delay", TODAY), TODAY);
    assert.equal(suggestPromiseDate("I'll get this out tomorrow", TODAY), "2026-07-11");
    assert.equal(suggestPromiseDate("Should be with you next week", TODAY), "2026-07-17");
  });

  it("reads a bare weekday as the next one", () => {
    // Today is Friday, so "Monday" is the 13th and "Friday" is a week out.
    assert.equal(suggestPromiseDate("We run payments on Monday", TODAY), "2026-07-13");
    assert.equal(suggestPromiseDate("Friday at the latest", TODAY), "2026-07-17");
  });

  it("reads end of week and end of month", () => {
    assert.equal(suggestPromiseDate("end of week", TODAY), "2026-07-17");
    assert.equal(suggestPromiseDate("Our run is end of the month", TODAY), "2026-07-31");
  });

  it("reads an explicit date, rolling to next year when it has passed", () => {
    assert.equal(suggestPromiseDate("Scheduled for 24 July", TODAY), "2026-07-24");
    assert.equal(suggestPromiseDate("August 3 at the latest", TODAY), "2026-08-03");
    assert.equal(suggestPromiseDate("We'll do it in February", TODAY), null);
    assert.equal(suggestPromiseDate("Pay date is January 5", TODAY), "2027-01-05");
  });

  it("returns null rather than guessing — the ladder must not be silenced by a regex", () => {
    assert.equal(suggestPromiseDate("We'll look at this in due course", TODAY), null);
    assert.equal(suggestPromiseDate("Who is this invoice from?", TODAY), null);
    assert.equal(suggestPromiseDate("", TODAY), null);
  });
});
