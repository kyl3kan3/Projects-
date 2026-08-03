"use client";

import { useState } from "react";
import { ProvenanceFigure, type ProvenanceThreadView } from "@/components/ProvenanceFigure";
import { IconBolt, IconFlame, IconLinkChain } from "@/components/icons";

/**
 * The three scope rows. Each figure opens the provenance thread; Scope 2 carries an
 * inline location/market toggle because both are reported and the difference is the
 * question an analyst asks first.
 *
 * A client component so the toggle and the thread are interactive, but it receives fully
 * computed threads as props — nothing here reaches the database.
 */

export interface ScopeRowData {
  scope1: { text: string; thread: ProvenanceThreadView };
  scope2Location: { text: string; thread: ProvenanceThreadView };
  scope2Market: { text: string; thread: ProvenanceThreadView };
  scope3: { text: string; thread: ProvenanceThreadView } | null;
}

export function ScopeRows({ data }: { data: ScopeRowData }) {
  const [method, setMethod] = useState<"market" | "location">("market");
  const scope2 = method === "market" ? data.scope2Market : data.scope2Location;

  return (
    <section className="mt-8">
      <h2 className="t-label">By scope</h2>

      <div className="row-plain mt-2" data-i="0">
        <div className="flex items-start gap-3">
          <span style={{ color: "var(--color-fg-2)", marginTop: 2 }}>
            <IconFlame size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="t-title">Scope 1 — fuel</p>
              <ProvenanceFigure thread={data.scope1.thread} label="Scope 1">
                <span className="t-mono text-[15px] font-medium">{data.scope1.text}</span>
              </ProvenanceFigure>
            </div>
            <p className="t-secondary mt-1">Gas and liquid fuel burned on site.</p>
          </div>
        </div>
      </div>

      <div className="row-plain" data-i="1">
        <div className="flex items-start gap-3">
          <span style={{ color: "var(--color-fg-2)", marginTop: 2 }}>
            <IconBolt size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="t-title">Scope 2 — electricity</p>
              <ProvenanceFigure
                thread={scope2.thread}
                label={`Scope 2 ${method}-based`}
              >
                <span className="t-mono text-[15px] font-medium">{scope2.text}</span>
              </ProvenanceFigure>
            </div>
            <div className="mt-2 flex gap-2">
              {(["market", "location"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className="chip"
                  data-active={method === m}
                  onClick={() => setMethod(m)}
                  style={{ height: 32 }}
                >
                  {m === "market" ? "Market-based" : "Location-based"}
                </button>
              ))}
            </div>
            <p className="t-secondary mt-2">
              {method === "market"
                ? "Credits electricity covered by a contract at zero. This is the figure in the reported total."
                : "Grid average for the region, ignoring contracts. The comparable figure."}
            </p>
          </div>
        </div>
      </div>

      <div className="row-plain" data-i="2">
        <div className="flex items-start gap-3">
          <span style={{ color: "var(--color-fg-2)", marginTop: 2 }}>
            <IconLinkChain size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="t-title">
                Scope 3 — spend screen{" "}
                <span className="t-label" style={{ letterSpacing: "0.08em" }}>
                  screen
                </span>
              </p>
              {data.scope3 ? (
                <ProvenanceFigure thread={data.scope3.thread} label="Scope 3">
                  <span className="t-mono text-[15px] font-medium">{data.scope3.text}</span>
                </ProvenanceFigure>
              ) : (
                <span className="t-data" style={{ color: "var(--color-fg-2)" }}>
                  NOT MEASURED
                </span>
              )}
            </div>
            <p className="t-secondary mt-1">
              {data.scope3
                ? "Categorised spend × published EEIO factors. An order of magnitude, not a measurement."
                : "Import a spend CSV to screen purchased goods and services. Unmeasured is not zero."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
