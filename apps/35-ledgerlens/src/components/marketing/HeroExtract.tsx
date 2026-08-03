/**
 * Beat 1 of four: the machine running, above the fold, within five seconds.
 *
 * A photographed receipt on the left, its fields arriving on the right one at a time with
 * their confidence printed, and then the settle rule drawing under the total as it turns
 * ledger green. All CSS keyframes on entry — no canvas, no JavaScript, no layout shift, so
 * the LCP element is text and the whole thing costs nothing on a phone.
 *
 * The receipt is an art-directed stand-in built from type, not a grey placeholder
 * rectangle: real line items, a real subtotal, a real total, in the same mono face the
 * product uses.
 */

import { IconFlagSmall, IconRuleOff } from "@/components/icons";

const RECEIPT_LINES = [
  ["2X4-8FT PRIME STUD", "14.28"],
  ["DECK SCREWS 5LB", "38.97"],
  ["PVC ELBOW 2IN", "6.44"],
  ["CAULK GUN", "12.99"],
];

const FIELDS = [
  { label: "Vendor", value: "The Home Depot #4412", confidence: "98%", flagged: false },
  { label: "Date", value: "2026-03-12", confidence: "97%", flagged: false },
  { label: "Tax", value: "$6.40", confidence: "95%", flagged: false },
  { label: "Category", value: "Supplies · Sch C 22", confidence: "71%", flagged: true },
];

export function HeroExtract() {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-[minmax(0,150px)_minmax(0,1fr)] sm:items-start">
      {/* The photographed receipt. */}
      <div
        className="mx-auto w-[150px] rotate-[-1.5deg] rounded-[8px] border p-3 sm:mx-0"
        style={{ background: "var(--color-card)", borderColor: "var(--color-line)" }}
        aria-hidden="true"
      >
        <p className="t-mono text-[8px] leading-[1.6]" style={{ color: "var(--color-ink-2)" }}>
          THE HOME DEPOT #4412
          <br />
          1600 S COLORADO BLVD
          <br />
          DENVER CO · 03/12/2026
        </p>
        <span className="mt-2 mb-2 block" style={{ height: 1, background: "var(--color-line)" }} />
        {RECEIPT_LINES.map(([item, amount]) => (
          <p
            key={item}
            className="t-mono flex justify-between gap-2 text-[8px] leading-[1.7]"
            style={{ color: "var(--color-ink-2)" }}
          >
            <span className="truncate">{item}</span>
            <span>{amount}</span>
          </p>
        ))}
        <span className="mt-2 mb-1 block" style={{ height: 1, background: "var(--color-line)" }} />
        <p className="t-mono flex justify-between text-[8px]" style={{ color: "var(--color-ink-3)" }}>
          <span>SUBTOTAL</span>
          <span>72.68</span>
        </p>
        <p className="t-mono flex justify-between text-[9px] font-semibold">
          <span>TOTAL</span>
          <span>79.08</span>
        </p>
      </div>

      {/* The fields it became. */}
      <div
        className="rounded-[12px] border p-4"
        style={{ background: "var(--color-card)", borderColor: "var(--color-line)" }}
      >
        <p className="t-label">Extracted</p>
        <div className="mt-3">
          {FIELDS.map((field, i) => (
            <div
              key={field.label}
              className="beat-field flex items-baseline justify-between gap-3 border-b py-2"
              data-i={i}
              style={{
                borderColor: "var(--color-line)",
                ...(field.flagged
                  ? { borderLeft: "2px solid var(--color-flag)", paddingLeft: 10, marginLeft: -14 }
                  : {}),
              }}
            >
              <span className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
                {field.label}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="t-mono text-[13px]">{field.value}</span>
                <span
                  className="t-data"
                  style={{ color: field.flagged ? "var(--color-flag)" : "var(--color-ink-3)" }}
                >
                  {field.confidence}
                </span>
              </span>
            </div>
          ))}

          {/* The total, ruled off. */}
          <div className="relative flex items-baseline justify-between gap-3 pt-3 pb-2">
            <span className="t-title">Total</span>
            <span className="t-mono hero-amount text-[20px]">$79.08</span>
            <span
              className="hero-settle"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 1.5,
                background: "var(--color-ledger)",
                transformOrigin: "left center",
              }}
              aria-hidden="true"
            />
          </div>
        </div>

        <p className="t-secondary mt-4 flex items-start gap-2" style={{ color: "var(--color-ink-2)" }}>
          <IconFlagSmall size={16} style={{ color: "var(--color-flag)", flex: "none", marginTop: 2 }} />
          One field was uncertain, so it was flagged instead of guessed. Category is a tap.
        </p>
        <p className="t-secondary mt-2 flex items-start gap-2" style={{ color: "var(--color-ink-2)" }}>
          <IconRuleOff size={16} style={{ color: "var(--color-ledger)", flex: "none", marginTop: 2 }} />
          Everything else cleared the threshold and was ruled off on its own.
        </p>
      </div>
    </div>
  );
}
