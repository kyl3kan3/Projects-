"use client";

import { useActionState, useState } from "react";
import { IconAlert, IconCheck, IconPause, IconPlay } from "@/components/icons";
import { logoutAction } from "@/app/(auth)/actions";
import {
  runSweepNowAction,
  saveFirmSettingsAction,
  setSendModeAction,
  toggleFollowUpAction,
  type SettingsState,
} from "./actions";

function Feedback({ state }: { state: SettingsState }) {
  if (!state.error && !state.notice) return null;
  return (
    <p
      className="t-secondary"
      role="status"
      style={{
        color: state.error ? "var(--color-red)" : "var(--color-banker)",
        display: "flex",
        gap: 8,
        marginTop: 8,
      }}
    >
      {state.error ? <IconAlert size={18} style={{ flex: "none" }} /> : <IconCheck size={18} style={{ flex: "none" }} />}
      <span>{state.error ?? state.notice}</span>
    </p>
  );
}

/**
 * The safety pair. Approval mode is the default and is described plainly; the
 * kill switch is a single tap and never more than one screen away.
 */
export function SendModeControls({
  sendMode,
  paused,
}: {
  sendMode: "approval" | "autopilot";
  paused: boolean;
}) {
  const [modeState, setMode, settingMode] = useActionState<SettingsState, FormData>(
    setSendModeAction,
    {},
  );
  const [pauseState, togglePause, toggling] = useActionState<SettingsState, FormData>(
    toggleFollowUpAction,
    {},
  );

  return (
    <div>
      <form action={togglePause}>
        <input type="hidden" name="paused" value={paused ? "0" : "1"} />
        <button
          className={paused ? "btn btn-primary btn-full" : "btn btn-secondary btn-full"}
          type="submit"
          disabled={toggling}
          style={paused ? undefined : { color: "var(--color-red)" }}
        >
          {paused ? <IconPlay size={18} /> : <IconPause size={18} />}
          {toggling
            ? "Switching…"
            : paused
              ? "Start follow-up again"
              : "Stop all follow-up now"}
        </button>
      </form>
      <p className="t-secondary" style={{ marginTop: 8 }}>
        {paused
          ? "Everything is stopped. No client on any invoice will hear from PaidWell."
          : "One tap stops every sequence for every client, immediately. Steps stay pinned to their dates, so nothing floods out when you switch back on."}
      </p>
      <Feedback state={pauseState} />

      <div style={{ marginTop: 24 }}>
        {(["approval", "autopilot"] as const).map((mode) => (
          <form key={mode} action={setMode}>
            <input type="hidden" name="sendMode" value={mode} />
            <button
              type="submit"
              className="row"
              disabled={settingMode || sendMode === mode}
              style={{ alignItems: "flex-start", opacity: settingMode ? 0.6 : 1 }}
            >
              <span
                aria-hidden="true"
                style={{
                  marginTop: 5,
                  width: 16,
                  height: 16,
                  flex: "none",
                  borderRadius: 999,
                  border: `2px solid ${sendMode === mode ? "var(--color-banker)" : "var(--color-hairline)"}`,
                  background:
                    sendMode === mode
                      ? "radial-gradient(circle, var(--color-banker) 0 4px, transparent 4px)"
                      : "transparent",
                }}
              />
              <span style={{ flex: 1 }}>
                <span className="t-title" style={{ display: "block" }}>
                  {mode === "approval" ? "Review before sending" : "Autopilot"}
                  {mode === "approval" ? (
                    <span className="t-label" style={{ marginLeft: 8, color: "var(--color-banker)" }}>
                      default
                    </span>
                  ) : null}
                </span>
                <span className="t-secondary" style={{ display: "block", marginTop: 2 }}>
                  {mode === "approval"
                    ? "Every step waits in the tray with the exact words it would send. Nothing reaches a client without your tap."
                    : "Steps send themselves on their pinned dates. Replies, promises and payments still stop them automatically."}
                </span>
              </span>
            </button>
          </form>
        ))}
        <Feedback state={modeState} />
      </div>
    </div>
  );
}

export function FirmSettingsForm({
  name,
  replyToEmail,
  senderDomain,
  senderVerified,
  defaultTermsDays,
  partialFloor,
  lateFeeMention,
  lateFeeCopy,
  signature,
}: {
  name: string;
  replyToEmail: string;
  senderDomain: string;
  senderVerified: boolean;
  defaultTermsDays: number;
  partialFloor: string;
  lateFeeMention: boolean;
  lateFeeCopy: string;
  signature: string;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    saveFirmSettingsAction,
    {},
  );
  const [feeOn, setFeeOn] = useState(lateFeeMention);

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Firm name (the letterhead)</span>
        <input className="field" name="name" defaultValue={name} required />
      </label>

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Reply-to address</span>
        <input className="field" type="email" name="replyToEmail" defaultValue={replyToEmail} placeholder="ana@northbank.studio" />
        <span className="t-secondary">
          A reply lands here and pauses that invoice&rsquo;s sequence immediately.
        </span>
      </label>

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Sending domain</span>
        <input className="field" name="senderDomain" defaultValue={senderDomain} placeholder="billing.northbank.studio" />
        <span className="t-secondary">
          {senderDomain
            ? senderVerified
              ? `Verified. Follow-ups send from billing@${senderDomain}.`
              : `Not verified yet, so sends come from our address with your firm's name and reply-to. Add SPF and DKIM records for ${senderDomain}, then re-save.`
            : "Follow-ups asking for a firm's money should come from that firm. Add a domain and we will send from it once SPF and DKIM check out."}
        </span>
      </label>

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Signature block</span>
        <textarea className="field" name="signature" defaultValue={signature} style={{ minHeight: 88 }} />
      </label>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-label">Default terms (days)</span>
          <input
            className="field"
            name="defaultTermsDays"
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            defaultValue={defaultTermsDays}
            style={{ fontFamily: "var(--font-mono)" }}
          />
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-label">Smallest part payment</span>
          <input
            className="field"
            name="partialFloor"
            defaultValue={partialFloor}
            style={{ fontFamily: "var(--font-mono)" }}
          />
        </label>
      </div>

      <div>
        <label className="row" style={{ cursor: "pointer", alignItems: "flex-start" }}>
          <input
            type="checkbox"
            name="lateFeeMention"
            checked={feeOn}
            onChange={(event) => setFeeOn(event.target.checked)}
            style={{ marginTop: 6, width: 18, height: 18, accentColor: "var(--color-banker)" }}
          />
          <span style={{ flex: 1 }}>
            <span className="t-title" style={{ display: "block" }}>
              Mention a late fee
            </span>
            <span className="t-secondary" style={{ display: "block", marginTop: 2 }}>
              Off by default. When on, the sentence appears from step 3 onwards only — never on
              an early nudge, where it reads as a threat.
            </span>
          </span>
        </label>
        {feeOn ? (
          <textarea className="field" name="lateFeeCopy" defaultValue={lateFeeCopy} style={{ minHeight: 88, marginTop: 12 }} />
        ) : null}
      </div>

      <Feedback state={state} />
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

export function SweepNowButton() {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(runSweepNowAction, {});
  return (
    <form action={formAction}>
      <button className="btn btn-secondary btn-full" type="submit" disabled={pending}>
        {pending ? "Running…" : "Run the daily sweep now"}
      </button>
      <p className="t-secondary" style={{ marginTop: 8 }}>
        Syncs, resolves promises, advances any step whose pinned date has arrived, writes
        payments back, and rebuilds the forecast. Running it twice sends nothing twice.
      </p>
      <Feedback state={state} />
    </form>
  );
}

export function SignOutButton() {
  return (
    <form action={logoutAction}>
      <button className="btn-quiet" type="submit" style={{ color: "var(--color-text-2)", paddingLeft: 0 }}>
        Sign out
      </button>
    </form>
  );
}
