/**
 * The coverage pill — the answer to the only question at the counter.
 *
 * Colour never carries the meaning on its own: the word is always there
 * (ON FILE / VISITOR / EXPIRED / NONE), which is also what makes the screen
 * readable at arm's length on a scuffed tablet.
 */

import { COVERAGE_LABEL, type Coverage } from "@/lib/coverage";

export function CoveragePill({ coverage }: { coverage: Coverage }) {
  return (
    <span className="pill" data-coverage={coverage}>
      <span className="pill-dot" />
      {COVERAGE_LABEL[coverage]}
    </span>
  );
}
