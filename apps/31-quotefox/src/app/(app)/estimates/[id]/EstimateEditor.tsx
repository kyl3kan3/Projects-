"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlert,
  IconCheck,
  IconClose,
  IconFlag,
  IconPencil,
  IconPlus,
  IconSend,
  IconTranscript,
} from "@/components/icons";
import { formatMoney, formatQuantity } from "@/lib/money";
import { formatOffset, quantityLabel } from "@/lib/item-fields";
import {
  addLineAction,
  removeLineAction,
  sendProposalAction,
  updateLineAction,
  updateSettingsAction,
} from "./actions";
import type { DepositType, Unit } from "@/db/schema";

/**
 * The estimate review screen — the signature moment.
 *
 * Rows type themselves in one at a time (24ms apart, opacity plus a 4px x-slide,
 * amount landing last) and the running total odometer-ticks upward as they land.
 * Reduced motion collapses all of it to a single short fade, and every state that
 * the animation communicates is also plain text in the row, so nothing is lost.
 *
 * The rest of the screen is an editor: tap any row to reprice it, tap the citation
 * to read the narration that produced it, and the flagged rows sit at the top
 * because they are the only thing standing between this draft and a sent proposal.
 */

export interface EditorLine {
  id: string;
  name: string;
  description: string | null;
  quantityMilli: number;
  unit: Unit;
  unitPriceCents: number;
  lineTotalCents: number;
  needsPricing: boolean;
  source: "ai" | "manual";
  transcriptExcerpt: string | null;
  transcriptOffsetSeconds: number | null;
}

export interface EditorProps {
  estimateId: string;
  jobId: string;
  locked: boolean;
  reveal: boolean;
  lines: EditorLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  taxRateBp: number;
  depositType: DepositType;
  depositValue: number;
  depositCents: number;
  depositWarning: string | null;
  depositsEnabled: boolean;
  depositUpgradeHint: string | null;
  customerEmail: string | null;
  customerName: string;
}

const UNITS: Unit[] = ["each", "hour", "sqft", "lf", "day"];

export function EstimateEditor(props: EditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ url: string; emailed: boolean; emailError?: string } | null>(
    null,
  );
  const [sweeping, setSweeping] = useState(false);
  const [showTotals, setShowTotals] = useState(false);
  const previousTotal = useRef(props.totalCents);
  const [rolling, setRolling] = useState(props.reveal);

  // The odometer rolls when the total actually changes, batched to one roll.
  useEffect(() => {
    if (previousTotal.current !== props.totalCents) {
      previousTotal.current = props.totalCents;
      setRolling(true);
      const timer = setTimeout(() => setRolling(false), 600);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [props.totalCents]);

  useEffect(() => {
    if (!props.reveal) return;
    const timer = setTimeout(() => setRolling(false), 800);
    return () => clearTimeout(timer);
  }, [props.reveal]);

  const flagged = props.lines.filter((line) => line.needsPricing);
  const ordered = [...flagged, ...props.lines.filter((line) => !line.needsPricing)];

  const send = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await sendProposalAction(props.estimateId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSweeping(true);
      setSent({
        url: result.url ?? "",
        emailed: Boolean(result.emailed),
        emailError: result.emailError,
      });
      router.refresh();
    });
  }, [props.estimateId, router]);

  const formatted = formatMoney(props.totalCents);
  const [dollars, cents] = formatted.replace("$", "").split(".");

  return (
    <div>
      {/* ---- running total ------------------------------------------------ */}
      <section className="gutter" style={{ paddingBottom: 20 }}>
        <p className="t-label">{props.locked ? "Sent total" : "Running total"}</p>
        <p className="t-stat" aria-live="polite" aria-label={formatted}>
          <span className="currency">$</span>
          <span className={rolling ? "odometer" : undefined}>{dollars}</span>
          <span className="cents">.{cents}</span>
        </p>
        {sweeping ? <span className="send-sweep" aria-hidden="true" /> : null}
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {props.lines.length} line{props.lines.length === 1 ? "" : "s"} ·{" "}
          {formatMoney(props.subtotalCents)} + {formatMoney(props.taxCents)} tax
          {props.depositCents > 0 ? ` · ${formatMoney(props.depositCents)} deposit` : ""}
        </p>
      </section>

      {/* ---- flagged summary --------------------------------------------- */}
      {flagged.length ? (
        <section className="gutter" style={{ paddingBottom: 20 }}>
          <div className="panel" style={{ padding: 16, display: "flex", gap: 12 }}>
            <IconFlag size={20} style={{ color: "var(--color-amber)", flex: "none" }} />
            <div>
              <p className="t-title">
                {flagged.length} line{flagged.length === 1 ? " needs" : "s need"} pricing
              </p>
              <p className="t-secondary" style={{ marginTop: 4 }}>
                You said this on the walkthrough and it is not in your price book, so nothing was
                guessed. Price {flagged.length === 1 ? "it" : "them"} or remove{" "}
                {flagged.length === 1 ? "it" : "them"} to send.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* ---- rows -------------------------------------------------------- */}
      <section className="gutter">
        <p className="t-label" style={{ paddingBottom: 4 }}>
          Line items
        </p>
        {ordered.map((line, index) => {
          const isEditing = editing === line.id;
          const isExpanded = expanded === line.id;
          return (
            <div
              key={line.id}
              className={props.reveal && index < 8 ? "type-in" : undefined}
              style={
                props.reveal && index < 8
                  ? { animationDelay: `${index * 24}ms`, borderBottom: "1px solid var(--color-hairline)" }
                  : { borderBottom: "1px solid var(--color-hairline)" }
              }
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 0" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    className="t-title"
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    {line.needsPricing ? (
                      <IconFlag size={16} style={{ color: "var(--color-amber)", flex: "none" }} />
                    ) : null}
                    {line.name}
                  </span>
                  <span
                    className="t-secondary"
                    style={{ display: "block", marginTop: 4, color: "var(--color-text-3)" }}
                  >
                    {line.needsPricing
                      ? "needs pricing"
                      : `${quantityLabel(line.quantityMilli, line.unit)} × ${formatMoney(line.unitPriceCents)}`}
                    {line.transcriptOffsetSeconds !== null
                      ? ` · from ${formatOffset(line.transcriptOffsetSeconds)} in the walkthrough`
                      : line.source === "manual"
                        ? " · added by hand"
                        : ""}
                  </span>
                </span>
                <span style={{ textAlign: "right", flex: "none" }}>
                  {line.needsPricing ? (
                    <span className="t-data needs-pricing amount">—</span>
                  ) : (
                    <span className="t-data amount" style={{ fontSize: 14 }}>
                      {formatMoney(line.lineTotalCents)}
                    </span>
                  )}
                </span>
                {props.locked ? null : (
                  <span style={{ display: "flex", gap: 4, flex: "none" }}>
                    {line.transcriptExcerpt ? (
                      <button
                        type="button"
                        aria-label="Show the narration behind this line"
                        onClick={() => setExpanded(isExpanded ? null : line.id)}
                        style={{
                          width: 44,
                          height: 44,
                          color: isExpanded ? "var(--color-hi-vis)" : "var(--color-text-3)",
                          background: "none",
                          border: 0,
                        }}
                      >
                        <IconTranscript size={18} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`Edit ${line.name}`}
                      onClick={() => setEditing(isEditing ? null : line.id)}
                      style={{
                        width: 44,
                        height: 44,
                        color: isEditing ? "var(--color-hi-vis)" : "var(--color-text-2)",
                        background: "none",
                        border: 0,
                      }}
                    >
                      <IconPencil size={18} />
                    </button>
                  </span>
                )}
              </div>

              {isExpanded && line.transcriptExcerpt ? (
                <p
                  className="t-secondary"
                  style={{
                    margin: "0 0 16px",
                    padding: 12,
                    borderRadius: 12,
                    background: "var(--color-toolbox)",
                  }}
                >
                  “{line.transcriptExcerpt}”
                </p>
              ) : null}

              {isEditing ? (
                <LineEditor
                  line={line}
                  estimateId={props.estimateId}
                  onDone={() => {
                    setEditing(null);
                    router.refresh();
                  }}
                  onError={setError}
                />
              ) : null}
            </div>
          );
        })}

        {!props.lines.length ? (
          <p className="t-secondary" style={{ padding: "16px 0" }}>
            Nothing on this estimate yet. Add a line by hand, or run another walkthrough.
          </p>
        ) : null}

        {props.locked ? null : adding ? (
          <NewLine
            estimateId={props.estimateId}
            onDone={() => {
              setAdding(false);
              router.refresh();
            }}
            onError={setError}
          />
        ) : (
          <button
            type="button"
            className="btn-quiet"
            style={{ marginTop: 12 }}
            onClick={() => setAdding(true)}
          >
            <IconPlus size={18} />
            Add a line
          </button>
        )}
      </section>

      {/* ---- totals, tax, deposit ---------------------------------------- */}
      <section className="gutter" style={{ paddingTop: 24 }}>
        <button
          type="button"
          className="row"
          style={{ borderTop: "1px solid var(--color-hairline)" }}
          onClick={() => setShowTotals((value) => !value)}
          disabled={props.locked}
        >
          <span style={{ flex: 1 }}>
            <span className="t-title" style={{ display: "block" }}>
              Tax and deposit
            </span>
            <span className="t-secondary" style={{ color: "var(--color-text-3)" }}>
              {(props.taxRateBp / 100).toFixed(2)}% on materials ·{" "}
              {props.depositType === "none"
                ? "no deposit"
                : props.depositType === "percent"
                  ? `${props.depositValue}% deposit`
                  : `${formatMoney(props.depositValue)} deposit`}
            </span>
          </span>
          <span className="t-data" style={{ color: "var(--color-text-3)" }}>
            {showTotals ? "hide" : "edit"}
          </span>
        </button>

        {showTotals && !props.locked ? (
          <TotalsEditor
            estimateId={props.estimateId}
            taxRateBp={props.taxRateBp}
            depositType={props.depositType}
            depositValue={props.depositValue}
            depositsEnabled={props.depositsEnabled}
            onDone={() => {
              setShowTotals(false);
              router.refresh();
            }}
            onError={setError}
          />
        ) : null}

        {props.depositWarning ? (
          <p
            className="t-secondary"
            style={{ marginTop: 12, color: "var(--color-amber)", display: "flex", gap: 8 }}
          >
            <IconAlert size={18} style={{ flex: "none" }} />
            <span>{props.depositWarning}</span>
          </p>
        ) : null}
        {props.depositUpgradeHint ? (
          <p className="t-secondary" style={{ marginTop: 12, color: "var(--color-text-3)" }}>
            {props.depositUpgradeHint}
          </p>
        ) : null}
      </section>

      {error ? (
        <section className="gutter" style={{ paddingTop: 20 }}>
          <p
            className="t-secondary"
            role="alert"
            style={{ color: "var(--color-red)", display: "flex", gap: 8 }}
          >
            <IconAlert size={18} style={{ flex: "none" }} />
            <span>{error}</span>
          </p>
        </section>
      ) : null}

      {sent ? (
        <section className="gutter" style={{ paddingTop: 24 }}>
          <div className="panel" style={{ padding: 16 }}>
            <p className="t-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <IconCheck size={18} style={{ color: "var(--color-hi-vis)" }} />
              The bid is out
            </p>
            <p className="t-secondary" style={{ marginTop: 6 }}>
              {sent.emailed
                ? `Emailed to ${props.customerEmail}. You will get a note the moment ${props.customerName} opens it.`
                : `Email is not sending from this install (${sent.emailError ?? "no provider configured"}), so copy the link and text it to ${props.customerName}.`}
            </p>
            <p
              className="t-data"
              style={{ marginTop: 12, wordBreak: "break-all", color: "var(--color-hi-vis)" }}
            >
              {sent.url}
            </p>
            <a
              className="btn btn-secondary btn-full"
              href={sent.url}
              target="_blank"
              rel="noreferrer"
              style={{ marginTop: 12 }}
            >
              Open what the homeowner sees
            </a>
          </div>
        </section>
      ) : null}

      {props.locked ? null : (
        <div className="thumb-bar">
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={send}
            disabled={pending || flagged.length > 0 || !props.lines.length || Boolean(sent)}
          >
            <IconSend size={18} />
            {pending ? "Sending…" : sent ? "Sent" : "Send proposal"}
          </button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- editors --- */

function LineEditor({
  line,
  estimateId,
  onDone,
  onError,
}: {
  line: EditorLine;
  estimateId: string;
  onDone: () => void;
  onError: (message: string | null) => void;
}) {
  const [name, setName] = useState(line.name);
  const [quantity, setQuantity] = useState(formatQuantity(line.quantityMilli));
  const [unitPrice, setUnitPrice] = useState(
    line.needsPricing ? "" : (line.unitPriceCents / 100).toFixed(2),
  );
  const [pending, startTransition] = useTransition();
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = () => {
    onError(null);
    startTransition(async () => {
      const result = await updateLineAction(estimateId, line.id, { name, quantity, unitPrice });
      if (result.error) onError(result.error);
      else onDone();
    });
  };

  const remove = () => {
    onError(null);
    startTransition(async () => {
      const result = await removeLineAction(estimateId, line.id);
      if (result.error) onError(result.error);
      else onDone();
    });
  };

  return (
    <div style={{ display: "grid", gap: 12, paddingBottom: 16 }}>
      <input
        className="field"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="Line name"
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="t-label">Qty ({line.unit})</span>
          <input
            className="field field-mono"
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="t-label">Unit price</span>
          <input
            className="field field-mono"
            inputMode="decimal"
            placeholder={line.needsPricing ? "1450.00" : undefined}
            value={unitPrice}
            onChange={(event) => setUnitPrice(event.target.value)}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <button className="btn btn-primary" type="button" onClick={save} disabled={pending}>
          <IconCheck size={18} />
          {pending ? "Saving…" : line.needsPricing ? "Price this line" : "Save"}
        </button>
        {/* Destructive: hold to confirm, 600ms radial fill. */}
        <button
          className="btn btn-danger"
          type="button"
          style={{ position: "relative", overflow: "hidden" }}
          onPointerDown={() => {
            setHolding(true);
            holdTimer.current = setTimeout(() => {
              setHolding(false);
              remove();
            }, 600);
          }}
          onPointerUp={() => {
            if (holdTimer.current) clearTimeout(holdTimer.current);
            setHolding(false);
          }}
          onPointerLeave={() => {
            if (holdTimer.current) clearTimeout(holdTimer.current);
            setHolding(false);
          }}
          disabled={pending}
        >
          <span
            className="hold-fill"
            data-holding={holding}
            style={{ borderRadius: 8, background: "color-mix(in srgb, var(--color-red) 22%, transparent)" }}
          />
          <IconClose size={18} />
          Hold to remove
        </button>
      </div>
    </div>
  );
}

function NewLine({
  estimateId,
  onDone,
  onError,
}: {
  estimateId: string;
  onDone: () => void;
  onError: (message: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [unit, setUnit] = useState<Unit>("each");
  const [pending, startTransition] = useTransition();

  return (
    <div style={{ display: "grid", gap: 12, padding: "16px 0" }}>
      <input
        className="field"
        placeholder="Crane lift for rooftop unit"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="New line name"
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <input
          className="field field-mono"
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          aria-label="Quantity"
        />
        <select
          className="field"
          value={unit}
          onChange={(event) => setUnit(event.target.value as Unit)}
          aria-label="Unit"
        >
          {UNITS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          className="field field-mono"
          inputMode="decimal"
          placeholder="1450.00"
          value={unitPrice}
          onChange={(event) => setUnitPrice(event.target.value)}
          aria-label="Unit price"
        />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <button
          className="btn btn-primary"
          type="button"
          disabled={pending || !name.trim()}
          onClick={() => {
            onError(null);
            startTransition(async () => {
              const result = await addLineAction(estimateId, { name, quantity, unitPrice, unit });
              if (result.error) onError(result.error);
              else onDone();
            });
          }}
        >
          <IconPlus size={18} />
          {pending ? "Adding…" : "Add line"}
        </button>
        <button className="btn btn-secondary" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function TotalsEditor({
  estimateId,
  taxRateBp,
  depositType,
  depositValue,
  depositsEnabled,
  onDone,
  onError,
}: {
  estimateId: string;
  taxRateBp: number;
  depositType: DepositType;
  depositValue: number;
  depositsEnabled: boolean;
  onDone: () => void;
  onError: (message: string | null) => void;
}) {
  const [tax, setTax] = useState((taxRateBp / 100).toFixed(2));
  const [type, setType] = useState<DepositType>(depositType);
  const [value, setValue] = useState(
    depositType === "fixed" ? (depositValue / 100).toFixed(2) : String(depositValue),
  );
  const [pending, startTransition] = useTransition();

  return (
    <div style={{ display: "grid", gap: 12, padding: "16px 0" }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">Sales tax % (materials only)</span>
        <input
          className="field field-mono"
          inputMode="decimal"
          value={tax}
          onChange={(event) => setTax(event.target.value)}
        />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="t-label">Deposit</span>
          <select
            className="field"
            value={type}
            onChange={(event) => setType(event.target.value as DepositType)}
            disabled={!depositsEnabled}
          >
            <option value="percent">Percent</option>
            <option value="fixed">Fixed</option>
            <option value="none">None</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="t-label">{type === "fixed" ? "Amount" : "Percent"}</span>
          <input
            className="field field-mono"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={type === "none" || !depositsEnabled}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <button
          className="btn btn-primary"
          type="button"
          disabled={pending}
          onClick={() => {
            onError(null);
            startTransition(async () => {
              const result = await updateSettingsAction(estimateId, {
                taxRatePct: tax,
                depositType: type,
                depositValue: value,
              });
              if (result.error) onError(result.error);
              else onDone();
            });
          }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button className="btn btn-secondary" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
