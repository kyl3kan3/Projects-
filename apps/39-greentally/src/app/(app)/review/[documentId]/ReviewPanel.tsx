"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { acceptAction, rejectAction, type ReviewState } from "../actions";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { IconMagnifier } from "@/components/icons";
import type { ActivityCategory } from "@/db/schema";

/**
 * The review panel: the bill on the left, the extracted fields on the right (stacked at
 * 390px, side by side from 768px per DESIGN.md).
 *
 * A field the reader was unsure about gets an amber underline and — the part that
 * matters on a deadline — the first low-confidence field is focused on load, so the
 * operator lands directly on the thing that needs a human.
 */

export interface ReviewLine {
  id: string;
  category: ActivityCategory;
  quantity: string;
  unit: string;
  unitOptions: string[];
  serviceStart: string;
  serviceEnd: string;
  provider: string;
  confidences: { quantity?: number; period?: number; provider?: number; category?: number };
  evidence: { quantity?: string; period?: string; provider?: string };
  reviewed: boolean;
}

const CATEGORY_OPTIONS: { value: ActivityCategory; label: string }[] = [
  { value: "electricity_kwh", label: "Purchased electricity" },
  { value: "natural_gas_kwh", label: "Natural gas" },
  { value: "diesel_l", label: "Diesel" },
  { value: "petrol_l", label: "Petrol / gasoline" },
  { value: "heating_oil_l", label: "Heating oil" },
  { value: "propane_l", label: "Propane / LPG" },
];

const ENERGY_UNITS = ["kWh", "MWh", "therms", "CCF", "MCF", "m³", "MMBtu", "GJ"];
const VOLUME_UNITS = ["L", "US gal", "imp gal"];

const LOW = 9_200;

function pct(bp?: number): string {
  if (bp === undefined) return "not read";
  return `${Math.floor(bp / 100)}%`;
}

export function ReviewPanel({
  documentId,
  filename,
  mimeType,
  fileUrl,
  status,
  error,
  extractor,
  siteId,
  sites,
  lines: initialLines,
  blockers,
}: {
  documentId: string;
  filename: string;
  mimeType: string;
  fileUrl: string;
  status: string;
  error: string | null;
  extractor: string | null;
  siteId: string;
  sites: { id: string; name: string }[];
  lines: ReviewLine[];
  blockers: string[];
}) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(acceptAction, {});
  const [lines, setLines] = useState<ReviewLine[]>(
    initialLines.length > 0
      ? initialLines
      : [
          {
            id: "new-1",
            category: "electricity_kwh",
            quantity: "",
            unit: "kWh",
            unitOptions: ENERGY_UNITS,
            serviceStart: "",
            serviceEnd: "",
            provider: "",
            confidences: {},
            evidence: {},
            reviewed: false,
          },
        ],
  );
  const [zoom, setZoom] = useState(false);

  const firstLowIndex = lines.findIndex(
    (l) => (l.confidences.quantity ?? 0) < LOW || (l.confidences.period ?? 0) < LOW,
  );

  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  return (
    <main className="screen pt-5">
      <Link href="/documents" className="t-secondary" style={{ color: "var(--color-accent-text)", fontWeight: 600 }}>
        Documents
      </Link>
      <h1 className="t-h2 mt-2 break-words">{filename}</h1>
      <p className="t-secondary mt-1">
        {status === "needs_review" ? "Needs your confirmation" : status === "accepted" ? "Accepted" : status}
        {extractor ? ` · read by ${extractor === "anthropic" ? "the vision model" : "the text-layer reader"}` : ""}
      </p>

      {error && (
        <div className="panel mt-4 p-4">
          <p className="t-label" style={{ color: "var(--color-amber-text)" }}>
            Why this needs you
          </p>
          <p className="t-body mt-2" style={{ maxWidth: "52ch" }}>
            {error}
          </p>
        </div>
      )}

      {blockers.length > 0 && (
        <div className="panel mt-4 p-4">
          <p className="t-label" style={{ color: "var(--color-red)" }}>
            Validation
          </p>
          <ul className="mt-2">
            {blockers.map((b) => (
              <li key={b} className="t-body" style={{ maxWidth: "52ch" }}>
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 md:grid md:grid-cols-2 md:gap-6">
        {/* The bill */}
        <section className="panel overflow-hidden p-3">
          <p className="t-label">The bill</p>
          <div className="mt-2 scroll-x" style={{ maxHeight: zoom ? "none" : 420, overflowY: "auto" }}>
            {isImage ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={fileUrl}
                alt={`Uploaded bill: ${filename}`}
                style={{
                  width: zoom ? "200%" : "100%",
                  maxWidth: zoom ? "none" : "100%",
                  display: "block",
                  borderRadius: 8,
                }}
              />
            ) : isPdf ? (
              <object
                data={fileUrl}
                type="application/pdf"
                style={{ width: "100%", height: 400, borderRadius: 8 }}
                aria-label={`Uploaded bill: ${filename}`}
              >
                <p className="t-secondary">
                  Your browser cannot display this PDF inline.{" "}
                  <a href={fileUrl} target="_blank" rel="noreferrer">
                    Open it in a new tab
                  </a>
                  .
                </p>
              </object>
            ) : (
              <p className="t-secondary">
                <a href={fileUrl} target="_blank" rel="noreferrer">
                  Open {filename}
                </a>
              </p>
            )}
          </div>
          <div className="mt-3 flex items-center gap-4">
            {isImage && (
              <button type="button" className="btn-quiet inline-flex items-center gap-2" onClick={() => setZoom((z) => !z)}>
                <IconMagnifier size={16} />
                {zoom ? "Fit to width" : "Zoom in"}
              </button>
            )}
            <a href={fileUrl} target="_blank" rel="noreferrer" className="t-secondary" style={{ fontWeight: 600 }}>
              Open the original
            </a>
          </div>
        </section>

        {/* The fields */}
        <form action={action} className="mt-6 md:mt-0">
          <input type="hidden" name="documentId" value={documentId} />

          <label className="field">
            <span className="t-label">Site</span>
            <select name="siteId" className="input" defaultValue={siteId}>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          {lines.map((line, idx) => {
            const lowQuantity = (line.confidences.quantity ?? 0) < LOW;
            const lowPeriod = (line.confidences.period ?? 0) < LOW;
            const units = line.category === "electricity_kwh" || line.category === "natural_gas_kwh" ? ENERGY_UNITS : VOLUME_UNITS;
            return (
              <fieldset key={line.id} className="mt-6 border-0 p-0">
                <input type="hidden" name="lineId" value={line.id} />
                <legend className="t-label" style={{ padding: 0 }}>
                  Reading {idx + 1} of {lines.length}
                </legend>

                <label className="field mt-3">
                  <span className="t-label">What was billed</span>
                  <select
                    name={`category_${line.id}`}
                    className="input"
                    value={line.category}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.id === line.id
                            ? { ...l, category: e.target.value as ActivityCategory, unit: (e.target.value === "electricity_kwh" || e.target.value === "natural_gas_kwh" ? "kWh" : "L") }
                            : l,
                        ),
                      )
                    }
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
                  <label className="field">
                    <span className="t-label">
                      Quantity{" "}
                      <span className="t-mono" style={{ textTransform: "none", letterSpacing: 0 }}>
                        · {pct(line.confidences.quantity)}
                      </span>
                    </span>
                    <input
                      name={`quantity_${line.id}`}
                      className={`input input-mono${lowQuantity ? " input-low" : ""}`}
                      inputMode="decimal"
                      defaultValue={line.quantity}
                      autoFocus={idx === firstLowIndex}
                      required
                    />
                  </label>
                  <label className="field">
                    <span className="t-label">Unit</span>
                    <select
                      name={`unit_${line.id}`}
                      className="input input-mono"
                      defaultValue={line.unit}
                      style={{ width: 128 }}
                    >
                      {units.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {line.evidence.quantity && (
                  <p className="t-secondary mt-2">Read from: “{line.evidence.quantity}”</p>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="field">
                    <span className="t-label">
                      Service start{" "}
                      <span className="t-mono" style={{ textTransform: "none", letterSpacing: 0 }}>
                        · {pct(line.confidences.period)}
                      </span>
                    </span>
                    <input
                      name={`start_${line.id}`}
                      type="date"
                      className={`input input-mono${lowPeriod ? " input-low" : ""}`}
                      defaultValue={line.serviceStart}
                      required
                    />
                  </label>
                  <label className="field">
                    <span className="t-label">Service end</span>
                    <input
                      name={`end_${line.id}`}
                      type="date"
                      className={`input input-mono${lowPeriod ? " input-low" : ""}`}
                      defaultValue={line.serviceEnd}
                      required
                    />
                  </label>
                </div>
                {line.evidence.period && (
                  <p className="t-secondary mt-2">Read from: “{line.evidence.period}”</p>
                )}

                <label className="field mt-4">
                  <span className="t-label">
                    Provider{" "}
                    <span className="t-mono" style={{ textTransform: "none", letterSpacing: 0 }}>
                      · {pct(line.confidences.provider)}
                    </span>
                  </span>
                  <input
                    name={`provider_${line.id}`}
                    className="input"
                    defaultValue={line.provider}
                    placeholder="Consolidated Edison"
                  />
                </label>

                {lines.length > 1 && (
                  <button
                    type="button"
                    className="btn-quiet mt-3"
                    onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                  >
                    Remove this reading
                  </button>
                )}
              </fieldset>
            );
          })}

          <button
            type="button"
            className="btn-quiet mt-5"
            onClick={() =>
              setLines((prev) => [
                ...prev,
                {
                  id: `new-${prev.length + 1}`,
                  category: "electricity_kwh",
                  quantity: "",
                  unit: "kWh",
                  unitOptions: ENERGY_UNITS,
                  serviceStart: "",
                  serviceEnd: "",
                  provider: prev[0]?.provider ?? "",
                  confidences: {},
                  evidence: {},
                  reviewed: false,
                },
              ])
            }
          >
            Add another reading from this bill
          </button>

          {state.error && (
            <p className="t-secondary mt-5" role="alert" style={{ color: "var(--color-red)" }}>
              {state.error}
            </p>
          )}

          <p className="t-secondary mt-6" style={{ maxWidth: "52ch" }}>
            Accepting records you as the person who confirmed these figures, and adds them to
            the audit trail with the quantities as they stand now.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
              {pending ? "Accepting…" : "Accept these figures"}
            </button>
            <RejectAction documentId={documentId} />
          </div>
        </form>
      </div>
    </main>
  );
}

function RejectAction({ documentId }: { documentId: string }) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn-quiet btn-quiet-red self-start" onClick={() => setOpen(true)}>
        Reject this document
      </button>
    );
  }

  return (
    <div className="panel p-4">
      <p className="t-label" style={{ color: "var(--color-red)" }}>
        Reject
      </p>
      <p className="t-secondary mt-2" style={{ maxWidth: "48ch" }}>
        Rejecting removes its readings from the footprint and recomputes. The original file
        stays for the audit trail.
      </p>
      <label className="field mt-3">
        <span className="t-label">Why (recorded in the audit trail)</span>
        <input
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Duplicate of the March statement"
        />
      </label>
      <div className="mt-4 flex flex-col gap-2">
        <HoldToConfirm
          label="Hold to reject"
          holdingLabel="Rejecting…"
          className="btn btn-secondary btn-full"
          onConfirm={() => void rejectAction(documentId, reason)}
        />
        <button type="button" className="btn-quiet self-start" onClick={() => setOpen(false)}>
          Keep it
        </button>
      </div>
    </div>
  );
}
