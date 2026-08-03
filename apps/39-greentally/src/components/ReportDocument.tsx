/**
 * The CSRD-lite report — one component, used on screen and in print.
 *
 * DESIGN.md: sheet ground, square corners, 1px hairline frame, Spectral headings, ruled
 * tables, mono figures, every table footnoted with its factor citations. The PDF is this
 * component printed, so there is no second layout to keep in sync.
 *
 * The document's job is to survive a procurement analyst reading it carefully. That means
 * it states its own limits — both Scope 2 methods, Scope 3 labelled a screen, the coverage
 * gaps named, and "not assured" in plain words on the cover.
 */

import {
  formatCentsCompact,
  formatFactorMicro,
  formatQuantityMilli,
  formatTonnes,
} from "@/lib/units";
import { methodologyNotes, type ReportContext } from "@/lib/report";
import { shortMonth } from "@/lib/documents";

export function ReportDocument({
  ctx,
  watermark = false,
  blurFrom,
}: {
  ctx: ReportContext;
  /** Free preview: stamp every page. */
  watermark?: boolean;
  /** Free preview: blur the pages after this index. */
  blurFrom?: number;
}) {
  const pages = [
    <CoverPage key="cover" ctx={ctx} />,
    <FiguresPage key="figures" ctx={ctx} />,
    <ActivityPage key="activity" ctx={ctx} />,
    <MethodologyPage key="method" ctx={ctx} />,
  ];

  return (
    <>
      {pages.map((page, i) => (
        <article
          key={i}
          className={`report-page${watermark ? " watermark" : ""}${
            blurFrom !== undefined && i >= blurFrom ? " blurred" : ""
          }`}
          aria-hidden={blurFrom !== undefined && i >= blurFrom ? true : undefined}
        >
          {page}
        </article>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------- cover --- */

function CoverPage({ ctx }: { ctx: ReportContext }) {
  const wordmark = ctx.org.settings.reportWordmark.trim();
  return (
    <>
      <p className="t-label">Greenhouse gas inventory · CSRD-lite</p>
      <h1 className="t-h1 mt-3">
        {ctx.org.name}
        <br />
        Reporting year {ctx.period.year}
      </h1>
      {wordmark && (
        <p className="t-secondary mt-2" style={{ color: "var(--color-accent-text)" }}>
          {wordmark}
        </p>
      )}

      <div className="mt-8">
        <p className="t-label">Total reported emissions</p>
        <p className="t-display mt-2">
          {formatTonnes(ctx.totals.totalMarket)} <span className="unit">tCO2e</span>
        </p>
        <p className="t-data mt-3" style={{ color: "var(--color-fg-2)" }}>
          SCOPE 1 {formatTonnes(ctx.totals.scope1)} · SCOPE 2 (MARKET){" "}
          {formatTonnes(ctx.totals.scope2Market)} · SCOPE 3 (SCREEN){" "}
          {formatTonnes(ctx.totals.scope3Spend)}
        </p>
        <p className="t-data mt-1" style={{ color: "var(--color-fg-2)" }}>
          WITH LOCATION-BASED SCOPE 2 THE TOTAL IS {formatTonnes(ctx.totals.totalLocation)} tCO2e
        </p>
      </div>

      <table className="report-table mt-8">
        <tbody>
          <tr>
            <td style={{ width: "42%" }}>Reporting period</td>
            <td className="t-mono">
              1 January – 31 December {ctx.period.year}
            </td>
          </tr>
          <tr>
            <td>Organisational boundary</td>
            <td>
              Operational control ·{" "}
              {ctx.sites.length === 0
                ? "no sites recorded"
                : ctx.sites.map((s) => s.name).join(", ")}
            </td>
          </tr>
          <tr>
            <td>Industry</td>
            <td>
              {ctx.org.industryLabel || "not recorded"}
              {ctx.org.industryCode && ctx.org.industryCode !== "000000"
                ? ` · NAICS ${ctx.org.industryCode}`
                : ""}
            </td>
          </tr>
          <tr>
            <td>Revenue · headcount</td>
            <td className="t-mono">
              {ctx.org.annualRevenueCents > 0
                ? formatCentsCompact(ctx.org.annualRevenueCents, ctx.org.reportingCurrency)
                : "not recorded"}{" "}
              · {ctx.org.fteCount > 0 ? `${ctx.org.fteCount} FTE` : "headcount not recorded"}
            </td>
          </tr>
          <tr>
            <td>Standard</td>
            <td>
              GHG Protocol Corporate Standard; Scope 2 dual reporting per the Scope 2
              Guidance
            </td>
          </tr>
          <tr>
            <td>Prepared by</td>
            <td>
              {ctx.org.settings.contactName || "—"}
              {ctx.org.settings.contactEmail ? ` · ${ctx.org.settings.contactEmail}` : ""}
            </td>
          </tr>
          <tr>
            <td>Prepared on</td>
            <td className="t-mono">{ctx.generatedAt.toISOString().slice(0, 10)}</td>
          </tr>
          <tr>
            <td>Engine version</td>
            <td className="t-mono">{ctx.engineVersion}</td>
          </tr>
        </tbody>
      </table>

      <p className="report-note mt-6" style={{ maxWidth: "68ch" }}>
        <strong>This report is not assured.</strong> No third party has verified these
        figures. It is a self-prepared inventory built from primary source documents —
        utility invoices, fuel receipts and a general-ledger export — and is intended for
        answering a customer sustainability questionnaire or an RFP scorecard. Scope 3 is a
        spend-based screening estimate and is labelled as such everywhere it appears.
      </p>

      {ctx.caveats.length > 0 && (
        <>
          <p className="t-label mt-6">Stated limitations</p>
          <ul className="mt-2">
            {ctx.caveats.map((c) => (
              <li key={c} className="report-note" style={{ maxWidth: "68ch" }}>
                — {c}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- figures --- */

function FiguresPage({ ctx }: { ctx: ReportContext }) {
  const scope1 = ctx.rows.filter((r) => r.scope === "1");
  const s2loc = ctx.rows.filter((r) => r.scope === "2_location");
  const s2mkt = ctx.rows.filter((r) => r.scope === "2_market");
  const s3 = ctx.rows.filter((r) => r.scope === "3_spend");

  return (
    <>
      <h2 className="t-h2">Emissions by scope</h2>

      <p className="t-label mt-6">Scope 1 — direct combustion</p>
      <ScopeTable rows={scope1} total={ctx.totals.scope1} emptyNote="No fuel combustion reported." />

      <p className="t-label mt-8">Scope 2 — purchased electricity, location-based</p>
      <ScopeTable
        rows={s2loc}
        total={ctx.totals.scope2Location}
        emptyNote="No purchased electricity reported."
      />

      <p className="t-label mt-8">Scope 2 — purchased electricity, market-based</p>
      <ScopeTable
        rows={s2mkt}
        total={ctx.totals.scope2Market}
        emptyNote="No purchased electricity reported."
      />
      <p className="report-note mt-2" style={{ maxWidth: "68ch" }}>
        Both Scope 2 methods are reported, as the GHG Protocol Scope 2 Guidance requires.
        Electricity covered by a contractual instrument is credited at zero in the
        market-based figure only; the location-based figure is unchanged by contracts.
      </p>

      <p className="t-label mt-8">Scope 3 — spend-based screening estimate</p>
      <ScopeTable
        rows={s3}
        total={ctx.totals.scope3Spend}
        emptyNote="No spend data was imported. Scope 3 is unmeasured, not zero."
      />
      {s3.length > 0 && (
        <p className="report-note mt-2" style={{ maxWidth: "68ch" }}>
          <strong>Screening estimate.</strong> Categorised spend multiplied by
          economic-input-output factors. Line-level uncertainty is a factor of two or more;
          read this as an order of magnitude that shows where to collect activity data next,
          not as a measurement. {ctx.spend.excludedRows} of {ctx.spend.rows} imported lines
          were excluded as transfers or as already counted in Scopes 1 and 2.
        </p>
      )}

      <h2 className="t-h2 mt-10">Intensity</h2>
      <table className="report-table mt-3">
        <thead>
          <tr>
            <th>Metric</th>
            <th className="num">Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>tCO2e per million {ctx.org.reportingCurrency} revenue</td>
            <td className="num">
              {ctx.intensityPerRevenueMilli > 0
                ? (ctx.intensityPerRevenueMilli / 1000).toFixed(2)
                : "not available"}
            </td>
          </tr>
          <tr>
            <td>tCO2e per full-time employee</td>
            <td className="num">
              {ctx.intensityPerFteMilli > 0
                ? (ctx.intensityPerFteMilli / 1000).toFixed(2)
                : "not available"}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="report-note mt-2">
        Both intensities use the reported total (Scope 1 + market-based Scope 2 + Scope 3
        screen) over the reporting-year denominator for the same boundary.
      </p>

      {ctx.siteRows.length > 0 && (
        <>
          <h2 className="t-h2 mt-10">By site</h2>
          <table className="report-table mt-3">
            <thead>
              <tr>
                <th>Site</th>
                <th>Grid region</th>
                <th>Market-based method</th>
                <th className="num">tCO2e</th>
              </tr>
            </thead>
            <tbody>
              {ctx.siteRows.map((s) => (
                <tr key={s.siteId}>
                  <td>{s.name}</td>
                  <td className="t-mono">{s.gridRegion}</td>
                  <td>
                    {s.marketMethod === "renewable_contract"
                      ? `${s.renewableSharePct}% contracted — ${s.contractNote || "instrument not named"}`
                      : "Grid average (no contractual instrument)"}
                  </td>
                  <td className="num">{formatTonnes(s.gco2e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function ScopeTable({
  rows,
  total,
  emptyNote,
}: {
  rows: ReportContext["rows"];
  total: number;
  emptyNote: string;
}) {
  if (rows.length === 0) {
    return <p className="report-note mt-2">{emptyNote}</p>;
  }
  return (
    <>
      <table className="report-table mt-3">
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">Activity</th>
            <th className="num">Factor</th>
            <th className="num">tCO2e</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.scope}-${r.category}-${r.factorLabel}`}>
              <td>
                {r.label}
                {/* Two market-based rows for one meter is correct and needs saying: the
                    covered volume is credited at zero, the remainder is not. */}
                {r.factorLabel === "Contractual instrument" ? " — covered by contract" : ""}
              </td>
              <td className="num">
                {r.unit === "USD cents"
                  ? formatCentsCompact(r.quantityMilli)
                  : `${formatQuantityMilli(r.quantityMilli)} ${r.unit}`}
              </td>
              <td className="num">
                {formatFactorMicro(r.factorMicro)}{" "}
                {r.unit === "USD cents" ? "kg/USD" : `kg/${r.unit}`}
              </td>
              <td className="num">{formatTonnes(r.gco2e)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ fontWeight: 600 }}>Total</td>
            <td />
            <td />
            <td className="num" style={{ fontWeight: 600 }}>
              {formatTonnes(total)}
            </td>
          </tr>
        </tbody>
      </table>
      <ol className="mt-2" style={{ paddingLeft: 0, listStyle: "none" }}>
        {[...new Map(rows.map((r) => [r.factorCitation, r])).values()]
          .filter((r) => r.factorCitation)
          .map((r) => (
            <li key={r.factorCitation} className="report-note">
              {r.factorLabel} — {r.factorCitation}
            </li>
          ))}
      </ol>
    </>
  );
}

/* ---------------------------------------------------------------- activity --- */

function ActivityPage({ ctx }: { ctx: ReportContext }) {
  return (
    <>
      <h2 className="t-h2">Energy and activity data</h2>
      {ctx.energy.length === 0 ? (
        <p className="report-note mt-3">No accepted activity data for this reporting year.</p>
      ) : (
        <table className="report-table mt-3">
          <thead>
            <tr>
              <th>Energy carrier</th>
              <th className="num">Quantity</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            {ctx.energy.map((e) => (
              <tr key={e.category}>
                <td>{e.label}</td>
                <td className="num">{formatQuantityMilli(e.quantityMilli)}</td>
                <td className="t-mono">{e.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="report-note mt-2">
        Gaseous fuels are converted to kWh on a higher heating value basis; volumes printed
        in therms, CCF, MCF or cubic metres are converted at the constants stated in the
        methodology. Liquid fuels are converted to litres.
      </p>

      <h2 className="t-h2 mt-10">Data coverage</h2>
      <table className="report-table mt-3">
        <thead>
          <tr>
            <th>Month</th>
            <th className="num">Sources present</th>
            <th>Status</th>
            <th>Missing</th>
          </tr>
        </thead>
        <tbody>
          {ctx.coverage.months.map((m) => (
            <tr key={m.key}>
              <td className="t-mono">{shortMonth(m.month - 1)}</td>
              <td className="num">
                {m.present} / {m.expected}
              </td>
              <td>{m.state === "complete" ? "Complete" : m.state === "partial" ? "Partial" : "No data"}</td>
              <td className="report-note">{m.missing.join("; ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="report-note mt-2" style={{ maxWidth: "68ch" }}>
        Coverage counts the {ctx.coverage.sources.length} monthly-metered source
        {ctx.coverage.sources.length === 1 ? "" : "s"} (site × electricity or gas) for which
        at least one invoice was supplied. Liquid-fuel deliveries are included in Scope 1
        wherever they occurred but are not expected in every month, and are listed in the
        activity table above. A source never supplied at all cannot appear here — that
        limitation is stated rather than implied.
      </p>

      {ctx.scope3Top.length > 0 && (
        <>
          <h2 className="t-h2 mt-10">Largest Scope 3 screening categories</h2>
          <table className="report-table mt-3">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Spend</th>
                <th className="num">tCO2e</th>
              </tr>
            </thead>
            <tbody>
              {ctx.scope3Top.map((s) => (
                <tr key={s.category}>
                  <td>{s.label}</td>
                  <td className="num">{formatCentsCompact(s.cents)}</td>
                  <td className="num">{formatTonnes(s.gco2e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 className="t-h2 mt-10">Provenance</h2>
      <p className="report-note mt-2" style={{ maxWidth: "68ch" }}>
        {ctx.activityLineCount} activity reading
        {ctx.activityLineCount === 1 ? "" : "s"} from {ctx.documentCount} uploaded document
        {ctx.documentCount === 1 ? "" : "s"} underpin the figures above. Each reading is
        stored with the invoice it came from, the quantity and unit as printed, the service
        period, the confidence of each extracted field, and the identity of the person who
        confirmed it where confirmation was required. The originals and the full audit trail
        are available on request.
      </p>
    </>
  );
}

/* ------------------------------------------------------------- methodology --- */

function MethodologyPage({ ctx }: { ctx: ReportContext }) {
  return (
    <>
      <h2 className="t-h2">Methodology</h2>
      {methodologyNotes(ctx).map((note) => (
        <section key={note.heading} className="mt-5">
          <p className="t-label">{note.heading}</p>
          <p className="t-secondary mt-2" style={{ maxWidth: "72ch", color: "var(--color-fg)" }}>
            {note.body}
          </p>
        </section>
      ))}

      <h2 className="t-h2 mt-10">Emission factors applied</h2>
      {ctx.factorsUsed.length === 0 ? (
        <p className="report-note mt-2">No factors have been applied yet.</p>
      ) : (
        <table className="report-table mt-3">
          <thead>
            <tr>
              <th>Factor</th>
              <th>Vintage</th>
              <th>Citation</th>
            </tr>
          </thead>
          <tbody>
            {ctx.factorsUsed.map((f) => (
              <tr key={f.citation}>
                <td>{f.label}</td>
                <td className="t-mono">{f.vintage}</td>
                <td className="report-note">{f.citation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="t-h2 mt-10">Unit conversions</h2>
      <table className="report-table mt-3">
        <tbody>
          <tr>
            <td>1 therm</td>
            <td className="num">29.3001 kWh</td>
          </tr>
          <tr>
            <td>1 CCF of pipeline natural gas</td>
            <td className="num">1.037 therms</td>
          </tr>
          <tr>
            <td>1 m³ of natural gas (gross CV)</td>
            <td className="num">10.5556 kWh</td>
          </tr>
          <tr>
            <td>1 US gallon</td>
            <td className="num">3.785412 L</td>
          </tr>
          <tr>
            <td>1 lb</td>
            <td className="num">0.45359237 kg</td>
          </tr>
        </tbody>
      </table>

      <p className="report-note mt-8" style={{ maxWidth: "68ch" }}>
        Prepared with GreenTally · engine {ctx.engineVersion} ·{" "}
        {ctx.generatedAt.toISOString().slice(0, 10)}. Figures are computed as integer grams
        CO2e from integer quantities and published factors; recomputation from the same
        inputs reproduces them exactly.
      </p>
    </>
  );
}
