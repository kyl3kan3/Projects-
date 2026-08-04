"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { markAppointment, type MarkState } from "@/app/(app)/today/actions";
import { Icon } from "@/components/icons";
import { DetailRow, FormError, ProtectedStat, StatePill } from "@/components/ui";
import { money, moneyShort } from "@/lib/format";

/**
 * The flagged appointment's resolve card: Completed / No-show / Grace, then the fee sheet.
 *
 * Three things about its construction are deliberate:
 *
 *  - **There is exactly one `<form>`.** A nested one would be silently dropped by the
 *    browser and its submit would run the outer action instead, which is how a
 *    hold-to-confirm control quietly runs "save" and never records the decision.
 *  - **The hold timer calls `requestSubmit()` directly.** No `startTransition` inside a
 *    `setState` updater — that throws in React 19 and surfaces as "a client-side exception
 *    has occurred", which is what the stylist would see instead of the feature.
 *  - **The arithmetic is shown before it happens.** The fee sheet itemises the policy's
 *    maths in mono, so charging is never a surprise to the person doing it either.
 */
export interface FeeMath {
  priceCents: number;
  percent: number;
  feeCents: number;
  depositCents: number;
  depositAppliedCents: number;
  chargeCents: number;
  policyVersion: number;
  hasCardOnFile: boolean;
  cardLast4: string | null;
}

const INITIAL: MarkState = {
  error: null,
  appointmentId: null,
  result: null,
  protectedCents: null,
  protectedHint: null,
};

export function ResolveCard({
  appointmentId,
  clientName,
  serviceName,
  timeLabel,
  math,
}: {
  appointmentId: string;
  clientName: string;
  serviceName: string;
  timeLabel: string;
  math: FeeMath;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(markAppointment, INITIAL);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const [verdict, setVerdict] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  /**
   * While the fee sheet is open, suppress the screen's fixed "Add appointment" bar (see
   * globals.css) and scroll the sheet into view.
   *
   * The bar is fixed to the bottom of the viewport, so it can sit on top of the sheet's own
   * primary button — and a tap aimed at "Hold to charge per policy" then activates "Add
   * appointment". Wrong action, worst possible moment.
   */
  useEffect(() => {
    if (!sheetOpen) return;
    document.body.dataset.sheetOpen = "true";
    sheetRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    return () => {
      delete document.body.dataset.sheetOpen;
    };
  }, [sheetOpen]);

  const result = state.result;

  if (result) {
    // The signature, in the order DESIGN.md sets it: the slot flips to its NO-SHOW face, the
    // arithmetic wipes in beneath it, the finished ledger line rises into place, and the
    // protected counter settles once. Every one of those states is also plain text and a pill,
    // so `prefers-reduced-motion` loses nothing but the movement.
    const waived = result.chargeStatus === "waived";
    return (
      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div className="slot flip" data-state={result.status}>
          <span className="slot-time">{timeLabel}</span>
          <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
            <span className="t-title">{clientName}</span>
            <StatePill state={result.status === "no_show" ? "no_show" : "completed"} />
          </span>
          <span className="slot-price">{moneyShort(math.priceCents)}</span>
        </div>

        {result.status === "no_show" && result.feeCents > 0 && (
          <p className="t-mono math-wipe" style={{ margin: 0, color: "var(--color-ink-2)" }}>
            {waived
              ? `${math.percent}% of ${moneyShort(math.priceCents)} · waived`
              : `${math.percent}% of ${moneyShort(math.priceCents)}${
                  result.depositAppliedCents > 0
                    ? ` · deposit kept ${money(result.depositAppliedCents)}`
                    : ""
                }`}
          </p>
        )}

        {result.chargeStatus && result.feeCents > 0 && (
          <div className="ledger-line ledger-land">
            <span>
              no-show fee ·{" "}
              <span style={{ color: "var(--color-ink-2)" }}>policy v{math.policyVersion}</span>
            </span>
            <span
              className={`ledger-amount${waived ? " ledger-amount-waived" : ""}`}
              style={result.chargeStatus === "failed" ? { color: "var(--color-red)" } : undefined}
            >
              {waived
                ? `${money(result.feeCents)} waived`
                : result.chargeStatus === "failed"
                  ? `${money(result.chargedCents)} declined`
                  : `+${money(result.chargedCents)}`}
            </span>
          </div>
        )}

        {state.protectedCents !== null && (
          <div>
            <p className="t-label" style={{ margin: 0 }}>
              Protected this month
            </p>
            <ProtectedStat
              cents={state.protectedCents}
              hint={state.protectedHint ?? ""}
              settle
            />
          </div>
        )}

        {result.chargeStatus === "failed" && (
          <p className="t-secondary" style={{ margin: 0, color: "var(--color-red)" }}>
            The card refused it: {result.failureReason}. It is on the ledger as declined — you
            decide how hard to chase it, and you can waive it from there.
          </p>
        )}
        {result.failureReason && result.chargeStatus === null && (
          <p className="t-secondary" style={{ margin: 0, color: "var(--color-ink-2)" }}>
            No fee: {result.failureReason}
          </p>
        )}
        {result.simulated && (
          <p className="t-secondary" style={{ margin: 0, color: "var(--color-amber-text)" }}>
            Recorded, not charged — Stripe is not configured in this environment.
          </p>
        )}

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => router.refresh()}
          style={{ justifySelf: "start" }}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="verdict" value={verdict} />

      <div>
        <p className="t-label" style={{ margin: 0 }}>
          Needs marking
        </p>
        <p className="t-title" style={{ margin: "4px 0 0" }}>
          {timeLabel} · {clientName}
        </p>
        <p className="t-secondary" style={{ margin: 0 }}>
          {serviceName} · {moneyShort(math.priceCents)}
          {math.hasCardOnFile ? ` · card on file ending ${math.cardLast4 ?? "----"}` : " · no card on file"}
        </p>
      </div>

      <FormError message={state.error} />

      {!sheetOpen ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="submit"
            className="btn btn-secondary"
            style={{ flex: "1 1 30%", minHeight: 44 }}
            disabled={pending}
            onClick={() => setVerdict("completed")}
          >
            <Icon name="check" size={18} />
            Completed
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: "1 1 30%", minHeight: 44, color: "var(--color-red)" }}
            disabled={pending}
            onClick={() => setSheetOpen(true)}
          >
            No-show
          </button>
          <button
            type="submit"
            className="btn btn-secondary"
            style={{ flex: "1 1 30%", minHeight: 44 }}
            disabled={pending}
            onClick={() => setVerdict("grace")}
          >
            Grace
          </button>
        </div>
      ) : (
        <div ref={sheetRef} className="sheet" style={{ padding: 16, display: "grid", gap: 4 }}>
          <p className="t-label" style={{ margin: "0 0 4px" }}>
            The policy, v{math.policyVersion}
          </p>
          <DetailRow term={serviceName}>{moneyShort(math.priceCents)}</DetailRow>
          <DetailRow term={`No-show fee at ${math.percent}%`}>{money(math.feeCents)}</DetailRow>
          {math.depositAppliedCents > 0 && (
            <DetailRow term="Deposit already held">-{money(math.depositAppliedCents)}</DetailRow>
          )}
          <DetailRow term="To charge the card" strong>
            {money(math.chargeCents)}
          </DetailRow>

          {!math.hasCardOnFile && math.chargeCents > 0 && (
            <p className="t-secondary" style={{ margin: "8px 0 0", color: "var(--color-amber-text)" }}>
              There is no card on file for this client, so the charge will be recorded as
              declined. The no-show still goes on their record.
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full hold"
            data-holding={holding ? "true" : "false"}
            style={{ marginTop: 12 }}
            disabled={pending}
            onPointerDown={() => {
              setVerdict("no_show");
              setHolding(true);
              timer.current = setTimeout(() => {
                setHolding(false);
                formRef.current?.requestSubmit();
              }, 600);
            }}
            onPointerUp={() => {
              setHolding(false);
              if (timer.current) clearTimeout(timer.current);
            }}
            onPointerLeave={() => {
              setHolding(false);
              if (timer.current) clearTimeout(timer.current);
            }}
            onClick={(e) => {
              // The hold is the commitment; a plain click must not charge anybody.
              e.preventDefault();
            }}
          >
            {pending ? "Charging…" : "Hold to charge per policy"}
          </button>

          <button
            type="submit"
            className="btn-quiet"
            style={{ justifySelf: "center", marginTop: 4 }}
            disabled={pending}
            onClick={() => setVerdict("no_show_waived")}
          >
            Waive the fee
          </button>

          <button
            type="button"
            className="btn-quiet"
            style={{ justifySelf: "center", color: "var(--color-ink-2)" }}
            onClick={() => setSheetOpen(false)}
          >
            Back
          </button>
        </div>
      )}
    </form>
  );
}
