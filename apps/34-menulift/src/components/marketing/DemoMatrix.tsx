/**
 * The device: "your menu, quadranted — stars to dogs."
 *
 * The numbers here are not invented for the page. They are the sample Toast export
 * shipped in `scripts/sample-toast-export.csv`, run through the *real*
 * `classify()` at render time — the same function the product uses. So the dots,
 * the quadrants, and the recommendation sentences are literally the product's own
 * output, and if the arithmetic ever changes, this page changes with it.
 *
 * The restaurant is fictional and labelled a demo. No customer, no testimonial,
 * no usage number is claimed anywhere.
 */

import { classify, plotPoint, summarise, type EngineeringInput } from "@/lib/engineering";
import { bpToPercent, money } from "@/lib/format";

/** The seed menu's prices and plate costs, and one week of the sample export. */
const SAMPLE: EngineeringInput[] = [
  ["Crispy Half Chicken", "Mains", 2400, 800, 182, 436800],
  ["Cacio e Pepe", "Mains", 2100, 520, 164, 344400],
  ["Dry-Aged Burger", "Mains", 1900, 760, 141, 267900],
  ["Grilled Swordfish", "Mains", 3200, 1400, 52, 166400],
  ["Mushroom Risotto", "Mains", 2200, 640, 44, 96800],
  ["Pork Chop Milanese", "Mains", 3400, 1520, 26, 88400],
  ["Burrata", "Starters", 1600, 700, 148, 236800],
  ["Little Gem Salad", "Starters", 1300, 420, 131, 170300],
  ["Charred Broccolini", "Starters", 1200, 380, 96, 115200],
  ["Marinated Olives", "Starters", 700, 180, 88, 61600],
  ["Shrimp Toast", "Starters", 1400, 800, 37, 51800],
].map(([name, section, price, cost, qty, revenue]) => ({
  itemId: String(name),
  itemName: String(name),
  sectionId: String(section),
  sectionName: String(section),
  priceCents: Number(price),
  costCents: Number(cost),
  qtySold: Number(qty),
  revenueCents: Number(revenue),
}));

const QUADRANT_LABEL: Record<string, string> = {
  star: "Star",
  plowhorse: "Plowhorse",
  puzzle: "Puzzle",
  dog: "Dog",
};

export function DemoMatrix() {
  const rows = classify(SAMPLE);
  const summary = summarise(rows);
  const dog = rows.find((r) => r.quadrant === "dog");
  const plowhorse = rows.find((r) => r.quadrant === "plowhorse");

  return (
    <div>
      <div className="matrix-field" role="img" aria-label="Popularity against margin, eleven dishes">
        <span className="matrix-axis-x" aria-hidden />
        <span className="matrix-axis-y" aria-hidden />
        <span className="matrix-corner" style={{ top: 8, right: 12 }}>
          Stars
        </span>
        <span className="matrix-corner" style={{ top: 8, left: 12 }}>
          Plowhorses
        </span>
        <span className="matrix-corner" style={{ bottom: 8, right: 12 }}>
          Puzzles
        </span>
        <span className="matrix-corner" style={{ bottom: 8, left: 12 }}>
          Dogs
        </span>
        {rows.map((row) => {
          const point = plotPoint(row);
          if (!point) return null;
          return (
            <span
              key={row.itemId}
              className={`matrix-dot${row.quadrant === "star" ? " matrix-dot-star" : ""}`}
              style={{ left: `${point.x * 100}%`, bottom: `${point.y * 100}%` }}
              title={`${row.itemName} — ${row.quadrant ? QUADRANT_LABEL[row.quadrant] : "no call"}`}
            />
          );
        })}
      </div>

      <p className="t-data" style={{ marginTop: 24, marginBottom: 0 }}>
        {summary.star} stars · {summary.plowhorse} plowhorses · {summary.puzzle} puzzles ·{" "}
        {summary.dog} dogs
      </p>

      <ul className="hairline-t" style={{ listStyle: "none", margin: "16px 0 0", padding: 0 }}>
        {[dog, plowhorse].filter(Boolean).map((row) => (
          <li key={row!.itemId} className="row" style={{ display: "block" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              <p className="t-dish" style={{ margin: 0, flex: 1 }}>
                {row!.itemName}
              </p>
              <p className="t-data" style={{ margin: 0 }}>
                {row!.qtySold} sold
              </p>
            </div>
            <p className="t-data" style={{ margin: "4px 0 0", color: "var(--fg-3)" }}>
              {QUADRANT_LABEL[row!.quadrant as string]} · {bpToPercent(row!.mixShareBp)} of{" "}
              {row!.sectionName} · {money(row!.contributionMarginCents ?? 0)} margin
            </p>
            <p className="t-secondary" style={{ margin: "8px 0 0", color: "var(--fg-2)" }}>
              {row!.recommendation}
            </p>
          </li>
        ))}
      </ul>

      <p className="t-secondary" style={{ marginTop: 16, marginBottom: 0 }}>
        Computed live from the sample export in this repository, by the same code that runs on your
        own CSV. Rossi &amp; Co is a demo restaurant.
      </p>
    </div>
  );
}
