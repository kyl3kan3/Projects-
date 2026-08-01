import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  assignableItems,
  costGaps,
  importHistory,
  latestImport,
  loadMatrix,
} from "@/lib/import-run";
import {
  MIN_ITEM_UNITS,
  MIN_SECTION_ITEMS,
  MIN_SECTION_UNITS,
  withheldLabel,
  type WithheldReason,
} from "@/lib/engineering";
import { bpToPercent, money, shortDate } from "@/lib/format";
import { featureAllowed, planRequiredFor } from "@/lib/plans";
import {
  AssignRowForm,
  DeleteImportForm,
  ImportForm,
  MatrixChart,
  PlateCostForm,
  type DotView,
} from "./MatrixUi";

export const metadata: Metadata = { title: "Matrix" };

const QUADRANT_ORDER = ["star", "plowhorse", "puzzle", "dog"] as const;
const QUADRANT_HEADING: Record<string, string> = {
  star: "Stars — protect these",
  plowhorse: "Plowhorses — re-price or re-cost",
  puzzle: "Puzzles — reposition and photograph",
  dog: "Dogs — cut or reinvent",
};

export default async function MatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string }>;
}) {
  const imported = (await searchParams).imported;
  const { organization, location } = await requireUser();

  if (!featureAllowed(organization.plan, "matrix")) {
    const required = planRequiredFor("matrix");
    return (
      <main className="screen" style={{ paddingTop: 24 }}>
        <h1 className="t-h2" style={{ marginTop: 0 }}>
          Menu engineering
        </h1>
        <p className="t-body">
          Upload a sales export from Toast or Square, enter your plate costs, and every dish lands in
          one of four quadrants with a specific thing to do about it. On the {required.name} plan.
        </p>
        <Link href="/settings/billing" className="btn btn-primary">
          See plans
        </Link>
      </main>
    );
  }

  const [current, history] = await Promise.all([
    latestImport(location.id),
    importHistory(location.id),
  ]);

  if (!current) {
    return (
      <main className="screen" style={{ paddingTop: 24 }}>
        <h1 className="t-h2" style={{ marginTop: 0, marginBottom: 8 }}>
          Menu engineering
        </h1>
        <p className="t-secondary" style={{ marginTop: 0, marginBottom: 24 }}>
          One CSV from your POS plus your plate costs gives you the stars/plowhorses/puzzles/dogs
          matrix — the analysis every hospitality course teaches and almost nobody actually runs.
        </p>
        <ImportForm />
        <section className="hairline-t" style={{ marginTop: 40, paddingTop: 24 }}>
          <h2 className="t-label" style={{ margin: 0 }}>
            What we will and won&apos;t tell you
          </h2>
          <p className="t-secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            A quadrant is a recommendation to change your menu, so we withhold one when the data
            can&apos;t support it: fewer than {MIN_SECTION_ITEMS} items in a section, under{" "}
            {MIN_SECTION_UNITS} covers in that section, under {MIN_ITEM_UNITS} of a single dish, or a
            missing plate cost. You&apos;ll see the reason instead of a guess.
          </p>
        </section>
      </main>
    );
  }

  const [rows, gaps, options] = await Promise.all([
    loadMatrix(current.id),
    costGaps(current.id),
    assignableItems(location.id, current.id),
  ]);

  const dots: DotView[] = rows.map((row) => ({
    itemId: row.itemId,
    itemName: row.itemName,
    sectionName: row.sectionName,
    quadrant: (row.quadrant as DotView["quadrant"]) ?? null,
    withheldReason: row.withheldReason,
    withheldLabel: row.withheldReason ? withheldLabel(row.withheldReason as WithheldReason) : null,
    // Chart space: both thresholds at 0.5, 2x the threshold at the rim.
    x: row.marginIndex === null ? null : Math.min(1, Math.max(0, row.marginIndex / 20000)),
    y: row.marginIndex === null ? null : Math.min(1, Math.max(0, row.popularityIndex / 20000)),
    qtySold: row.qtySold,
    mixSharePercent: bpToPercent(row.mixShareBp),
    priceCents: row.priceCents,
    contributionMarginCents: row.contributionMarginCents,
    recommendation: row.recommendation,
  }));

  const counts = QUADRANT_ORDER.map((q) => ({
    quadrant: q,
    rows: rows.filter((r) => r.quadrant === q),
  }));
  const withheld = rows.filter((r) => !r.quadrant);

  return (
    <main className="screen" style={{ paddingTop: 24 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 className="t-h2" style={{ marginTop: 0, marginBottom: 8 }}>
          Menu engineering
        </h1>
        <p className="t-data" style={{ margin: 0, color: "var(--fg-3)" }}>
          {current.filename} · {current.source} · {shortDate(current.createdAt, location.timezone)} ·{" "}
          {current.matchedCount}/{current.rowCount} rows matched
        </p>
        {imported ? (
          <p className="t-body" role="status" style={{ marginTop: 12, marginBottom: 0, color: "#5f7e4e" }}>
            {imported}
          </p>
        ) : null}
        <details style={{ marginTop: 16 }}>
          <summary className="btn-quiet" style={{ cursor: "pointer", display: "inline-block" }}>
            New import
          </summary>
          <div style={{ marginTop: 16 }}>
            <ImportForm />
          </div>
        </details>
      </header>

      <MatrixChart dots={dots} />

      {gaps.length ? (
        <section className="hairline-t" style={{ marginTop: 40, paddingTop: 24 }}>
          <h2 className="t-label" style={{ margin: 0 }}>
            Add plate costs — {gaps.length} {gaps.length === 1 ? "dish" : "dishes"}
          </h2>
          <p className="t-secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            These sold, but we don&apos;t know what they cost to make, so they have no margin axis.
            Type the food cost of one plate and the matrix rebuilds itself.
          </p>
          <div style={{ marginTop: 8 }}>
            {gaps.map((gap) => (
              <PlateCostForm
                key={gap.itemId}
                itemId={gap.itemId}
                itemName={gap.name}
                priceCents={gap.priceCents}
                qtySold={gap.qtySold}
              />
            ))}
          </div>
        </section>
      ) : null}

      {counts.map(({ quadrant, rows: quadrantRows }) =>
        quadrantRows.length ? (
          <section key={quadrant} style={{ marginTop: 40 }}>
            <h2 className="t-label" style={{ margin: 0 }}>
              {QUADRANT_HEADING[quadrant]} — {quadrantRows.length}
            </h2>
            <ul className="hairline-t" style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
              {quadrantRows.map((row) => (
                <li key={row.itemId} className="row" style={{ display: "block" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                    <p className="t-dish" style={{ margin: 0, flex: 1 }}>
                      {row.itemName}
                    </p>
                    <p className="t-data" style={{ margin: 0 }}>
                      {row.qtySold} sold
                    </p>
                  </div>
                  <p className="t-data" style={{ margin: "4px 0 0", color: "var(--fg-3)" }}>
                    {row.sectionName} · {bpToPercent(row.mixShareBp)} of section ·{" "}
                    {row.contributionMarginCents === null
                      ? "no margin"
                      : `${money(row.contributionMarginCents)} margin`}
                  </p>
                  <p className="t-secondary" style={{ margin: "8px 0 0", color: "var(--fg-2)" }}>
                    {row.recommendation}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}

      {withheld.length ? (
        <section style={{ marginTop: 40 }}>
          <h2 className="t-label" style={{ margin: 0 }}>
            No call yet — {withheld.length}
          </h2>
          <p className="t-secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            We won&apos;t put a quadrant on a dish the numbers can&apos;t support.
          </p>
          <ul className="hairline-t" style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
            {withheld.map((row) => (
              <li key={row.itemId} className="row" style={{ display: "block" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                  <p className="t-dish" style={{ margin: 0, flex: 1 }}>
                    {row.itemName}
                  </p>
                  <span className="pill pill-draft">
                    <span className="pill-dot" />
                    {withheldLabel(row.withheldReason as WithheldReason)}
                  </span>
                </div>
                <p className="t-secondary" style={{ margin: "8px 0 0", color: "var(--fg-2)" }}>
                  {row.recommendation}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {current.unmatched.length ? (
        <section style={{ marginTop: 40 }}>
          <h2 className="t-label" style={{ margin: 0 }}>
            Rows we couldn&apos;t match — {current.unmatched.length}
          </h2>
          <p className="t-secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            Gift cards, modifiers and renamed dishes end up here. Match the real ones by hand; we
            won&apos;t guess.
          </p>
          <div style={{ marginTop: 8 }}>
            {current.unmatched.map((row) => (
              <AssignRowForm
                key={row.name}
                importId={current.id}
                rowName={row.name}
                qty={row.qty}
                netCents={row.netCents}
                options={options}
              />
            ))}
          </div>
        </section>
      ) : null}

      {history.length > 1 ? (
        <section className="hairline-t" style={{ marginTop: 40, paddingTop: 24 }}>
          <h2 className="t-label" style={{ margin: 0 }}>
            Import history
          </h2>
          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
            {history.map((record) => (
              <li key={record.id} className="hairline-b" style={{ paddingTop: 12, paddingBottom: 12 }}>
                <p className="t-body" style={{ margin: 0 }}>
                  {record.filename}
                </p>
                <p className="t-data" style={{ margin: "2px 0 0", color: "var(--fg-3)" }}>
                  {shortDate(record.createdAt, location.timezone)} · {record.source} ·{" "}
                  {record.matchedCount}/{record.rowCount} matched · {record.status}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div style={{ marginTop: 24 }}>
        <DeleteImportForm importId={current.id} />
      </div>
    </main>
  );
}
