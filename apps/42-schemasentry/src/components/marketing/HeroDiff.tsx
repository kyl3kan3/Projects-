/**
 * The hero: the product actually running.
 *
 * MARKETING_PLAYBOOK law 2 — "the hero is the machine visibly running, not copy
 * over a backdrop" — so this is not a mockup. The two specs below are diffed by
 * `@/core`, the same engine the CLI and the CI check use, on every request. The
 * verdict, the counts, the reasons and the JSON pointers are whatever the engine
 * says; nothing here is hand-written prose pretending to be output.
 *
 * The signature detail (the strike-draw on the removed line) is the app's own,
 * reused verbatim: the selling moment DESIGN.md names is a red line striking
 * through a removed field, so the marketing page shows exactly that and nothing
 * more.
 */

import { diffRaw } from "@/core";
import { LevelLabel } from "@/components/Verdict";
import { countLine } from "@/lib/format";

const BEFORE = `openapi: 3.1.0
info: { title: Orders API, version: "2026-06-01" }
paths:
  /v1/orders:
    get:
      responses:
        "200":
          description: A page of orders
          content:
            application/json:
              schema:
                type: object
                required: [id, status, invoice_url]
                properties:
                  id: { type: string }
                  status: { type: string, enum: [open, paid, cancelled] }
                  invoice_url: { type: string }
`;

const AFTER = `openapi: 3.1.0
info: { title: Orders API, version: "2026-08-01" }
paths:
  /v1/orders:
    get:
      responses:
        "200":
          description: A page of orders
          content:
            application/json:
              schema:
                type: object
                required: [id, status]
                properties:
                  id: { type: string }
                  status: { type: string, enum: [open, paid] }
                  invoice_url: { type: string }
                  receipt_url: { type: string }
`;

/** The consumer registry entry that turns a generic verdict into a name. */
const CONSUMERS = [
  {
    id: "acme",
    name: "Acme webhooks",
    declaredUsage: {
      endpoints: ["GET /v1/orders"],
      fields: ["status", "invoice_url"],
      enumValues: ["cancelled"],
    },
  },
];

export async function HeroDiff() {
  const result = await diffRaw(BEFORE, AFTER, undefined, CONSUMERS);
  const notable = result.findings.filter((f) => f.level !== "compatible");
  const compatible = result.summary.compatible;

  return (
    <div>
      <p className="t-label" style={{ color: "var(--color-text-2)", margin: "0 0 8px" }}>
        <span className="t-data" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
          DEPLOY 4d81e07 VS 9f3c2ab
        </span>
      </p>
      <p
        className="t-display stamp-word stamp-animate"
        data-level={result.verdict}
        style={{ margin: "0 0 8px" }}
      >
        {result.verdict.toUpperCase()}
      </p>
      <p className="t-data" style={{ color: "var(--color-text-2)", margin: "0 0 20px" }}>
        {countLine(result.summary)}
      </p>

      <div className="stack" style={{ gap: 12 }}>
        {notable.slice(0, 2).map((finding, index) => {
          const impacted = result.impacts
            .filter((i) => i.details.some((d) => d.findingIndex === result.findings.indexOf(finding)))
            .map((i) => i.name);
          return (
            <article
              key={finding.jsonPointer + finding.ruleId}
              className="card settle"
              style={{ ["--settle-delay" as string]: `${index * 60}ms`, minWidth: 0 }}
            >
              <div style={{ marginBottom: 8 }}>
                <LevelLabel level={finding.level} />
              </div>
              <h3 className="t-title" style={{ margin: "0 0 6px" }}>
                {finding.message}
              </h3>
              <p className="t-data" style={{ color: "var(--color-text-2)", margin: "0 0 8px" }}>
                {finding.method} {finding.endpoint}
              </p>
              <div className="xscroll">
                <p className="t-data" style={{ color: "var(--color-diffdim-text)", margin: 0, whiteSpace: "nowrap" }}>
                  {finding.jsonPointer}
                </p>
              </div>
              <div className="minidiff xscroll">
                {finding.diffLines.map((line, i) => (
                  <div className="minidiff-line" key={`${i}-${line.text}`}>
                    <span className="minidiff-no">
                      {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
                    </span>
                    <span
                      className={`minidiff-text ${line.kind === "del" ? "strike strike-draw" : ""}`}
                      data-kind={line.kind}
                      style={
                        line.kind === "del"
                          ? ({ ["--strike-delay" as string]: `${index * 40}ms` } as React.CSSProperties)
                          : undefined
                      }
                    >
                      {line.text}
                    </span>
                  </div>
                ))}
              </div>
              {impacted.length > 0 ? (
                <p className="t-secondary" style={{ margin: "12px 0 0" }}>
                  <span className="t-label level-label" data-level={finding.level}>
                    Breaks:
                  </span>{" "}
                  {impacted.join(" · ")}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      <p className="t-secondary" style={{ margin: "12px 0 0" }}>
        {compatible} compatible change{compatible === 1 ? "" : "s"} not shown. Engine{" "}
        <span className="t-data">{result.engineVersion}</span>, run on this page by the same code your CI
        would use.
      </p>
    </div>
  );
}

/** The rule taxonomy figure, read from the corpus rather than asserted. */
export { CONSUMERS as HERO_CONSUMERS };
