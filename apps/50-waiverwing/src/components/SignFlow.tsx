"use client";

/**
 * The signing flow (DESIGN.md "Signing flow" and "Guardian flow stepper").
 *
 * One screen per step, mobile-first, one-handed in a queue. Two paths from the
 * first screen because the guardian case is not an edge case at a family-facing
 * venue — it is half the Saturday queue, and burying it behind a checkbox is how
 * paper binders end up with waivers signed by fourteen-year-olds.
 *
 * The waiver text is rendered server-side and handed in as `blocks`; nothing here
 * fetches it. Submission posts to /api/sign, and in kiosk mode a failed post
 * lands in an IndexedDB outbox and syncs later with the same `offlineKey`.
 */

import { useEffect, useMemo, useState } from "react";
import { BlazeConfirmation } from "@/components/Blaze";
import { SignaturePad } from "@/components/SignaturePad";
import { IconChevronLeft, IconWifiOff } from "@/components/icons";
import { signForLabel } from "@/lib/minors";
import type { WaiverBlock } from "@/db/schema";
import { queueSigning, type QueuedSigning } from "@/lib/outbox";

export interface SignFlowProps {
  token: string;
  versionId: string;
  venueName: string;
  waiverTitle: string;
  waiverVersion: number;
  blocks: WaiverBlock[];
  disclosure: string;
  allowDrawn: boolean;
  ageOfMajority: number;
  relationshipOptions: string[];
  expiryLabel: string;
  channel: "qr" | "kiosk" | "link";
  kiosk?: boolean;
  /** Kiosk only: called after the confirmation so the attract screen can return. */
  onComplete?: (names: string[]) => void;
  posterFooter?: boolean;
}

type Mode = "choose" | "adult" | "guardian";
type Step = "who" | "guardian" | "minors" | "read" | "sign" | "done";

interface MinorRow {
  firstName: string;
  lastName: string;
  dob: string;
  relationship: string;
  medical: string;
}

function cfg(block: WaiverBlock, key: string): string {
  const v = block.config[key];
  return typeof v === "string" ? v : "";
}

function newOfflineKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function SignFlow(props: SignFlowProps) {
  const [mode, setMode] = useState<Mode>("choose");
  const [step, setStep] = useState<Step>("who");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);
  const [names, setNames] = useState<string[]>([]);

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [minors, setMinors] = useState<MinorRow[]>([
    { firstName: "", lastName: "", dob: "", relationship: props.relationshipOptions[0] ?? "Parent", medical: "" },
  ]);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [initials, setInitials] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState(false);
  const [sigKind, setSigKind] = useState<"typed" | "drawn">(props.allowDrawn ? "drawn" : "typed");
  const [typed, setTyped] = useState("");
  const [drawn, setDrawn] = useState("");

  const clauses = useMemo(
    () => props.blocks.filter((b) => b.kind === "initialed_clause"),
    [props.blocks],
  );
  const questions = useMemo(
    () => props.blocks.filter((b) => b.kind === "question"),
    [props.blocks],
  );
  const texts = useMemo(
    () => props.blocks.filter((b) => b.kind === "liability_text"),
    [props.blocks],
  );

  // Typed signature defaults to the name they gave — one less thing to type in a
  // queue, still editable, and always their own keystrokes that submit it.
  useEffect(() => {
    if (sigKind === "typed" && !typed && first && last) setTyped(`${first} ${last}`);
  }, [sigKind, typed, first, last]);

  const minorNames = minors.map((m) => m.firstName.trim()).filter(Boolean);

  async function submit() {
    setError(null);
    setBusy(true);
    const offlineKey = newOfflineKey();

    const payload: QueuedSigning = {
      token: props.token,
      versionId: props.versionId,
      channel: props.channel,
      signer: {
        firstName: first.trim(),
        lastName: last.trim(),
        dob: dob.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
      },
      minors:
        mode === "guardian"
          ? minors
              .filter((m) => m.firstName.trim() || m.lastName.trim() || m.dob.trim())
              .map((m) => ({
                firstName: m.firstName.trim(),
                lastName: m.lastName.trim(),
                dob: m.dob.trim(),
                relationship: m.relationship,
                answers: m.medical.trim() ? medicalAnswerFor(m.medical.trim()) : undefined,
              }))
          : undefined,
      answers,
      initials,
      signatureKind: sigKind,
      signatureData: sigKind === "drawn" ? drawn : typed.trim(),
      disclosureAccepted: accepted,
      offlineKey,
      capturedAt: new Date().toISOString(),
    };

    try {
      const res = await fetch("/api/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save that.");
        setBusy(false);
        return;
      }
      setNames(data.names ?? minorNames);
      setStep("done");
      props.onComplete?.(data.names ?? minorNames);
    } catch {
      // Offline (or the server is unreachable). On a kiosk that is a normal
      // Saturday, so the signing is queued and the customer is told the truth.
      if (props.kiosk) {
        await queueSigning(payload);
        setQueued(true);
        setNames(mode === "guardian" ? minorNames : [first.trim()]);
        setStep("done");
        props.onComplete?.(mode === "guardian" ? minorNames : [first.trim()]);
      } else {
        setError(
          "No connection. Check your signal and tap sign again — nothing has been recorded yet.",
        );
      }
    }
    setBusy(false);
  }

  /** A per-minor medical answer keyed onto whichever question is the medical one. */
  function medicalAnswerFor(value: string): Record<string, string> {
    const medical = questions.find((q) => Boolean(q.config.medical));
    return medical ? { [medical.key]: value } : {};
  }

  const gutter = props.kiosk ? "px-8" : "px-5";
  const bodyClass = props.kiosk ? "kiosk-body" : "t-body";

  /* ------------------------------------------------------------- screens */

  if (step === "done") {
    const label =
      names.length > 1
        ? `You're signed in, ${names.slice(0, -1).join(", ")} and ${names.at(-1)}.`
        : `You're signed in, ${names[0] ?? "thanks"}.`;
    return (
      <div className={`${gutter} py-10`}>
        <BlazeConfirmation
          headline={label}
          detail={
            queued
              ? "SAVED ON THIS DEVICE · WILL SYNC WHEN THE WI-FI IS BACK"
              : `${props.waiverTitle.toUpperCase()} V${props.waiverVersion}`
          }
          size={props.kiosk ? 64 : 48}
        />
        {queued ? (
          <p className="t-secondary text-center">
            <IconWifiOff size={16} className="mr-1 inline-block" />
            This device is offline. Your signature is stored here and uploads by itself — you do
            not need to sign again.
          </p>
        ) : (
          <p className="t-secondary text-center">
            {email.trim()
              ? `A copy is on its way to ${email.trim()}.`
              : "Ask the front desk if you would like a copy."}
          </p>
        )}
      </div>
    );
  }

  if (mode === "choose") {
    return (
      <div className={`${gutter} py-8`}>
        <p className="t-label">{props.venueName}</p>
        <h1 className={props.kiosk ? "t-display mt-3" : "t-h2 mt-3"}>{props.waiverTitle}</h1>
        <p className={`${bodyClass} mt-4`} style={{ color: "var(--color-text-2)" }}>
          {props.expiryLabel} Anyone under {props.ageOfMajority} must be signed for by a parent or
          legal guardian.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <button
            className={`btn btn-primary btn-full ${props.kiosk ? "btn-kiosk" : ""}`}
            onClick={() => {
              setMode("adult");
              setStep("who");
            }}
          >
            I&rsquo;m signing for myself
          </button>
          <button
            className={`btn btn-secondary btn-full ${props.kiosk ? "btn-kiosk" : ""}`}
            onClick={() => {
              setMode("guardian");
              setStep("guardian");
            }}
          >
            A parent or guardian is signing
          </button>
        </div>

        <p className="t-secondary mt-6">
          Signing for yourself and for children? Start with the guardian option — you can add
          yourself as a participant on the same waiver.
        </p>
      </div>
    );
  }

  const stepper =
    mode === "guardian" ? (
      <div className="flex items-center gap-2">
        {(["guardian", "minors", "sign"] as const).map((s) => {
          const active = step === s || (s === "sign" && step === "read");
          return (
            <span
              key={s}
              className="t-label"
              style={{ color: active ? "var(--color-trail)" : "var(--color-text-3)" }}
            >
              {s === "guardian" ? "GUARDIAN" : s === "minors" ? "MINORS" : "SIGN"}
            </span>
          );
        })}
      </div>
    ) : null;

  const back = () => {
    setError(null);
    if (step === "who") setMode("choose");
    else if (step === "guardian") setMode("choose");
    else if (step === "minors") setStep("guardian");
    else if (step === "read") setStep(mode === "guardian" ? "minors" : "who");
    else if (step === "sign") setStep("read");
  };

  const header = (
    <div className="flex items-center justify-between gap-4 pt-6">
      <button className="btn-quiet flex items-center gap-1" onClick={back}>
        <IconChevronLeft size={16} />
        Back
      </button>
      {stepper}
    </div>
  );

  if (step === "who" || step === "guardian") {
    const isGuardian = step === "guardian";
    const canContinue = first.trim() && last.trim() && dob.trim();
    return (
      <div className={gutter}>
        {header}
        <h1 className={props.kiosk ? "t-display mt-5" : "t-h2 mt-5"}>
          {isGuardian ? "Who is signing?" : "Your details"}
        </h1>
        <p className={`${bodyClass} mt-2`} style={{ color: "var(--color-text-2)" }}>
          {isGuardian
            ? `The adult signing. We check this date of birth against the age of majority (${props.ageOfMajority}) — a person under it cannot sign for anyone.`
            : "As they appear on an ID, so the record can be matched later."}
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="t-label">First name</span>
            <input className="input" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Last name</span>
            <input className="input" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Date of birth</span>
            <input
              className="input input-mono"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Email {isGuardian ? "" : "(for your copy)"}</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="dana@example.com"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Phone</span>
            <input
              className="input input-mono"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              placeholder="303 555 0117"
            />
          </label>
        </div>

        <div className="action-bar mt-8">
          <button
            className={`btn btn-primary btn-full ${props.kiosk ? "btn-kiosk" : ""}`}
            disabled={!canContinue}
            onClick={() => setStep(isGuardian ? "minors" : "read")}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (step === "minors") {
    const canContinue = minors.some((m) => m.firstName.trim() && m.lastName.trim() && m.dob.trim());
    return (
      <div className={gutter}>
        {header}
        <h1 className={props.kiosk ? "t-display mt-5" : "t-h2 mt-5"}>Who are you signing for?</h1>
        <p className={`${bodyClass} mt-2`} style={{ color: "var(--color-text-2)" }}>
          Add each child. One signature covers all of them, and each gets their own record linked
          to you.
        </p>

        <div className="mt-6">
          {minors.map((m, i) => (
            <div key={i} className="hairline-b py-4">
              <div className="flex items-center justify-between">
                <span className="t-label">Participant {i + 1}</span>
                {minors.length > 1 ? (
                  <button
                    className="btn-quiet"
                    style={{ color: "var(--color-ember)" }}
                    onClick={() => setMinors(minors.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="mt-3 flex flex-col gap-3">
                <input
                  className="input"
                  placeholder="First name"
                  value={m.firstName}
                  onChange={(e) =>
                    setMinors(minors.map((x, j) => (j === i ? { ...x, firstName: e.target.value } : x)))
                  }
                />
                <input
                  className="input"
                  placeholder="Last name"
                  value={m.lastName}
                  onChange={(e) =>
                    setMinors(minors.map((x, j) => (j === i ? { ...x, lastName: e.target.value } : x)))
                  }
                />
                <label className="flex flex-col gap-1.5">
                  <span className="t-label">Date of birth</span>
                  <input
                    className="input input-mono"
                    type="date"
                    value={m.dob}
                    onChange={(e) =>
                      setMinors(minors.map((x, j) => (j === i ? { ...x, dob: e.target.value } : x)))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="t-label">Your relationship to them</span>
                  <select
                    className="input"
                    value={m.relationship}
                    onChange={(e) =>
                      setMinors(
                        minors.map((x, j) => (j === i ? { ...x, relationship: e.target.value } : x)),
                      )
                    }
                  >
                    {props.relationshipOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="t-label">Anything staff should know about them</span>
                  <textarea
                    className="input"
                    rows={2}
                    value={m.medical}
                    onChange={(e) =>
                      setMinors(minors.map((x, j) => (j === i ? { ...x, medical: e.target.value } : x)))
                    }
                    placeholder="Asthma inhaler in the blue bag; wrist healing from a break in June."
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <button
          className="btn-quiet mt-4"
          onClick={() =>
            setMinors([
              ...minors,
              {
                firstName: "",
                lastName: last,
                dob: "",
                relationship: props.relationshipOptions[0] ?? "Parent",
                medical: "",
              },
            ])
          }
        >
          Add another child
        </button>

        <div className="action-bar mt-8">
          <button
            className={`btn btn-primary btn-full ${props.kiosk ? "btn-kiosk" : ""}`}
            disabled={!canContinue}
            onClick={() => setStep("read")}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (step === "read") {
    const requiredAnswered = questions.every(
      (q) => !q.config.required || (answers[q.key] ?? "").trim(),
    );
    return (
      <div className={gutter}>
        {header}
        <h1 className={props.kiosk ? "t-display mt-5" : "t-h2 mt-5"}>{props.waiverTitle}</h1>
        <p className="t-data mt-2" style={{ color: "var(--color-text-2)" }}>
          VERSION {props.waiverVersion}
        </p>

        <div className="waiver-scroll mt-5">
          {texts.map((b) => (
            <div key={b.key} className="mb-5">
              <p className="t-title">{cfg(b, "heading")}</p>
              <p className={`${bodyClass} mt-2`} style={{ color: "var(--color-text-2)" }}>
                {cfg(b, "body")}
              </p>
            </div>
          ))}
        </div>

        {questions.length ? (
          <>
            <p className="t-label mt-8">A few questions</p>
            <div className="mt-3 flex flex-col gap-4">
              {questions.map((q) => {
                const kind = cfg(q, "kind") || "text";
                const label = cfg(q, "label");
                const help = cfg(q, "help");
                return (
                  <label key={q.key} className="flex flex-col gap-2">
                    <span className="t-label">
                      {label}
                      {q.config.required ? "" : " (optional)"}
                    </span>
                    {kind === "long_text" ? (
                      <textarea
                        className="input"
                        rows={3}
                        value={answers[q.key] ?? ""}
                        onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                      />
                    ) : kind === "yes_no" ? (
                      <select
                        className="input"
                        value={answers[q.key] ?? ""}
                        onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                      >
                        <option value="">Choose…</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    ) : (
                      <input
                        className={kind === "phone" ? "input input-mono" : "input"}
                        type={kind === "email" ? "email" : kind === "phone" ? "tel" : "text"}
                        value={answers[q.key] ?? ""}
                        onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                      />
                    )}
                    {help ? <span className="t-secondary">{help}</span> : null}
                  </label>
                );
              })}
            </div>
          </>
        ) : null}

        <div className="action-bar mt-8">
          <button
            className={`btn btn-primary btn-full ${props.kiosk ? "btn-kiosk" : ""}`}
            disabled={!requiredAnswered}
            onClick={() => setStep("sign")}
          >
            {requiredAnswered ? "Continue to the signature" : "Answer the required questions"}
          </button>
        </div>
      </div>
    );
  }

  // step === "sign"
  const allInitialed = clauses.every((c) => (initials[c.key] ?? "").trim().length >= 2);
  const hasMark = sigKind === "drawn" ? drawn.length > 0 : typed.trim().length >= 3;
  const canSign = allInitialed && accepted && hasMark;
  const signLabel =
    mode === "guardian" ? signForLabel(minorNames) : `Sign as ${first.trim() || "me"}`;

  return (
    <div className={gutter}>
      {header}
      <h1 className={props.kiosk ? "t-display mt-5" : "t-h2 mt-5"}>Initial and sign</h1>

      {clauses.length ? (
        <>
          <p className="t-label mt-6">Initial each point</p>
          <div className="mt-2">
            {clauses.map((c) => (
              <div key={c.key} className="clause-row">
                <input
                  className="initials-box"
                  maxLength={6}
                  placeholder="ABC"
                  aria-label={cfg(c, "prompt")}
                  value={initials[c.key] ?? ""}
                  onChange={(e) => setInitials({ ...initials, [c.key]: e.target.value })}
                />
                <span className="t-secondary min-w-0 flex-1">{cfg(c, "text")}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <p className="t-label mt-8">Signature</p>
      {props.allowDrawn ? (
        <div className="mt-2 flex gap-2">
          <button
            className="chip"
            data-active={sigKind === "drawn"}
            onClick={() => setSigKind("drawn")}
          >
            Draw
          </button>
          <button
            className="chip"
            data-active={sigKind === "typed"}
            onClick={() => setSigKind("typed")}
          >
            Type
          </button>
        </div>
      ) : null}

      <div className="mt-3">
        {sigKind === "drawn" ? (
          <SignaturePad onChange={setDrawn} height={props.kiosk ? 200 : 160} />
        ) : (
          <>
            <input
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type your full name"
              aria-label="Type your full name as your signature"
            />
            <p className="t-secondary mt-2">
              Typing your full name here is your signature.
            </p>
          </>
        )}
      </div>

      <label className="mt-6 flex items-start gap-3">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1"
        />
        <span className="t-secondary">{props.disclosure}</span>
      </label>

      {error ? (
        <p className="t-secondary mt-4" style={{ color: "var(--color-ember)" }} role="alert">
          {error}
        </p>
      ) : null}

      <div className="action-bar mt-8">
        <button
          className={`btn btn-primary btn-full ${props.kiosk ? "btn-kiosk" : ""}`}
          disabled={!canSign || busy}
          onClick={submit}
        >
          {busy ? "Saving…" : canSign ? signLabel : "Initial every point and tick the box"}
        </button>
      </div>
    </div>
  );
}
