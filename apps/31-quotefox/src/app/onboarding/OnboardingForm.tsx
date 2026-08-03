"use client";

import { useActionState, useState } from "react";
import { IconAlert, IconCheck } from "@/components/icons";
import { completeOnboardingAction, type OnboardingState } from "./actions";
import { TRADE_LABELS, TRADE_ORDER } from "@/lib/trades";
import type { Trade } from "@/db/schema";

/** The colour choices are jobsite colours, and none of them is purple. */
const BRAND_COLORS = [
  { hex: "#CD7A29", name: "Hi-vis orange" },
  { hex: "#B8452F", name: "Torch red" },
  { hex: "#3F7A63", name: "Field green" },
  { hex: "#2F5D8A", name: "Blueprint" },
  { hex: "#8A6A2F", name: "Brass" },
];

const STARTER_COUNTS: Record<Trade, number> = {
  hvac: 18,
  roofing: 15,
  electrical: 16,
  plumbing: 16,
  other: 8,
};

export function OnboardingForm({
  companyName,
  trade,
}: {
  companyName: string;
  trade: Trade;
}) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    completeOnboardingAction,
    {},
  );
  const [selectedTrade, setSelectedTrade] = useState<Trade>(trade);
  const [depositType, setDepositType] = useState<"none" | "percent" | "fixed">("percent");
  const [brandColor, setBrandColor] = useState(BRAND_COLORS[0].hex);

  return (
    <form action={formAction} style={{ display: "grid", gap: 32 }}>
      <section>
        <p className="t-label">Your trade</p>
        <p className="t-secondary" style={{ marginTop: 6, marginBottom: 12 }}>
          It sets your starter price book and the words we listen for on a walkthrough.
        </p>
        <div className="scroll-x" style={{ display: "flex", gap: 8, paddingBottom: 4 }}>
          {TRADE_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              className="chip"
              data-active={selectedTrade === option}
              onClick={() => setSelectedTrade(option)}
            >
              {TRADE_LABELS[option]}
            </button>
          ))}
        </div>
        <input type="hidden" name="trade" value={selectedTrade} />
      </section>

      <section style={{ display: "grid", gap: 16 }}>
        <p className="t-label">On every proposal</p>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-secondary">Company name</span>
          <input className="field" name="name" defaultValue={companyName} required />
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-secondary">License number</span>
          <input className="field" name="licenseNumber" placeholder="TACLA00281C" />
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-secondary">Insurance line</span>
          <input
            className="field"
            name="insuranceLine"
            placeholder="Liability & workers' comp on file"
          />
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-secondary">Phone</span>
          <input className="field" name="phone" inputMode="tel" placeholder="(512) 555-0143" />
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-secondary">Shop address</span>
          <input className="field" name="address" placeholder="1804 Airport Blvd, Austin, TX 78702" />
        </label>
        <div>
          <span className="t-secondary">Accent colour on your proposal</span>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {BRAND_COLORS.map((color) => (
              <button
                key={color.hex}
                type="button"
                aria-label={color.name}
                aria-pressed={brandColor === color.hex}
                onClick={() => setBrandColor(color.hex)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  border:
                    brandColor === color.hex
                      ? "2px solid var(--color-text)"
                      : "1px solid var(--color-hairline)",
                  background: color.hex,
                }}
              />
            ))}
          </div>
          <input type="hidden" name="brandColor" value={brandColor} />
        </div>
      </section>

      <section style={{ display: "grid", gap: 16 }}>
        <p className="t-label">Estimate defaults</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-secondary">Markup %</span>
            <input
              className="field field-mono"
              name="defaultMarkupPct"
              inputMode="decimal"
              defaultValue="35"
            />
          </label>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-secondary">Sales tax %</span>
            <input
              className="field field-mono"
              name="taxRatePct"
              inputMode="decimal"
              defaultValue="8.25"
            />
          </label>
        </div>
        <p className="t-secondary" style={{ color: "var(--color-text-3)" }}>
          Tax is applied to materials and flat-rate lines, not labour.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-secondary">Deposit</span>
            <select
              className="field"
              name="depositType"
              value={depositType}
              onChange={(event) => setDepositType(event.target.value as typeof depositType)}
            >
              <option value="percent">Percent of total</option>
              <option value="fixed">Fixed amount</option>
              <option value="none">No deposit</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-secondary">
              {depositType === "fixed" ? "Amount" : depositType === "percent" ? "Percent" : "—"}
            </span>
            <input
              className="field field-mono"
              name="depositValue"
              inputMode="decimal"
              defaultValue={depositType === "fixed" ? "500.00" : "10"}
              disabled={depositType === "none"}
            />
          </label>
        </div>
      </section>

      <section>
        <label
          className="row"
          style={{ borderTop: "1px solid var(--color-hairline)", cursor: "pointer" }}
        >
          <input
            type="checkbox"
            name="seedPriceBook"
            defaultChecked
            style={{ width: 22, height: 22, accentColor: "var(--color-hi-vis)" }}
          />
          <span style={{ flex: 1 }}>
            <span className="t-title" style={{ display: "block" }}>
              Start me with the {TRADE_LABELS[selectedTrade].toLowerCase()} price book
            </span>
            <span className="t-secondary" style={{ color: "var(--color-text-3)" }}>
              {STARTER_COUNTS[selectedTrade]} real items at supply-house costs, marked as ours so you
              know which numbers to replace. Import your own sheet any time.
            </span>
          </span>
        </label>
      </section>

      {state.error ? (
        <p
          className="t-secondary"
          role="alert"
          style={{ color: "var(--color-red)", display: "flex", gap: 8 }}
        >
          <IconAlert size={18} />
          <span>{state.error}</span>
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Setting up…" : "Finish setup"}
        {pending ? null : <IconCheck size={18} />}
      </button>
    </form>
  );
}
