"use client";

/**
 * The upload screen's form.
 *
 * Three ways in — a file, pasted text, or the labelled sample contract — because the
 * buyer moment is "a contract in the inbox and a deadline", and one of those three is
 * always to hand.
 *
 * The primary button lives in the thumb zone and states the price when the account has
 * no credits, per DESIGN.md ("Review for $19"). It never starts a review the account
 * cannot pay for and then asks for money afterwards.
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { startReviewAction, type UploadState } from "../actions";
import { IconAlertTriangle, IconUploadDoc } from "@/components/icons";

type Mode = "file" | "paste";

export function UploadForm({
  credits,
  perContractPrice,
  sampleKey,
  sampleName,
}: {
  credits: number;
  perContractPrice: string;
  sampleKey: string;
  sampleName: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<UploadState, FormData>(startReviewAction, {
    error: null,
  });
  const [mode, setMode] = useState<Mode>("file");
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [useSample, setUseSample] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.contractId) router.push(`/contracts/${state.contractId}`);
  }, [state.contractId, router]);

  const ready = useSample || (mode === "file" ? Boolean(fileName) : text.trim().length >= 200);
  const label = pending
    ? "Reading the document…"
    : credits > 0
      ? "Review this contract"
      : `Review for ${perContractPrice}`;

  return (
    <form action={formAction}>
      <input type="hidden" name="mode" value={useSample ? "sample" : mode} />
      <input type="hidden" name="sample" value={sampleKey} />

      {mode === "file" ? (
        <>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="w-full text-left"
            style={{
              background: "var(--color-sheet)",
              border: "1px dashed var(--color-hairline)",
              borderRadius: "var(--radius-card)",
              padding: 24,
              minHeight: 132,
              cursor: "pointer",
            }}
          >
            <span className="flex items-start gap-3">
              <span style={{ color: "var(--color-oxblood)", marginTop: 2 }}>
                <IconUploadDoc size={20} />
              </span>
              <span>
                <span className="t-title block">
                  {fileName ?? "Choose the contract they sent you"}
                </span>
                <span className="t-secondary mt-1 block">
                  PDF or DOCX, up to 100 pages. It stays private to your account and is
                  deleted after 90 days.
                </span>
              </span>
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            name="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => {
              setFileName(e.target.files?.[0]?.name ?? null);
              setUseSample(false);
            }}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
            tabIndex={-1}
            aria-hidden="true"
          />
          <div className="mt-4">
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                setMode("paste");
                setUseSample(false);
              }}
            >
              or paste the text
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="field">
            <span className="field-label">Paste the contract</span>
            <textarea
              className="input"
              name="text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setUseSample(false);
              }}
              placeholder={"MASTER SERVICES AGREEMENT\n\nThis Agreement is entered into as of…"}
              spellCheck={false}
            />
            <span className="field-help">
              {text.trim().length > 0
                ? `${text.trim().length.toLocaleString("en-US")} characters`
                : "Everything between the title and the signature block."}
            </span>
          </label>
          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              setMode("file");
              setUseSample(false);
            }}
          >
            or choose a file
          </button>
        </>
      )}

      <div className="hairline-t mt-8 pt-6">
        <p className="t-label mb-2">Details (optional)</p>
        <label className="field">
          <span className="field-label">Who sent it?</span>
          <input
            className="input"
            name="counterparty"
            placeholder="Northgate Retail Group, Inc."
            autoComplete="off"
          />
          <span className="field-help">
            Left blank, ClauseCompass reads the counterparty out of the preamble.
          </span>
        </label>
      </div>

      <div className="hairline-t mt-2 pt-6">
        <p className="t-label mb-2">Not ready to upload yours?</p>
        <button
          type="button"
          className="btn-quiet"
          onClick={() => {
            setUseSample(true);
            requestAnimationFrame(() => {
              (document.getElementById("start-review") as HTMLButtonElement | null)?.click();
            });
          }}
        >
          Review the demo contract instead
        </button>
        <p className="t-secondary mt-2">
          {sampleName} — an invented contract written to be a bad one. Labelled as a demo
          everywhere it appears, and it uses one review credit.
        </p>
      </div>

      {state.error && (
        <p
          className="mt-6 flex items-start gap-2 text-[13px] leading-[1.45]"
          style={{ color: "var(--color-oxblood)" }}
          role="alert"
        >
          <IconAlertTriangle size={18} />
          <span>
            {state.error}
            {state.needsCredits && (
              <>
                {" "}
                <Link href="/settings/billing" className="btn-quiet btn-quiet-sm">
                  Add reviews
                </Link>
              </>
            )}
          </span>
        </p>
      )}

      <div className="sticky-action">
        <button
          id="start-review"
          className="btn btn-primary btn-full"
          type="submit"
          disabled={pending || (!ready && !useSample)}
        >
          {label}
        </button>
        <p className="t-secondary mt-2 text-center" style={{ color: "var(--color-text-3)" }}>
          {credits > 0
            ? `${credits} ${credits === 1 ? "review" : "reviews"} left on your plan`
            : "One review, one price. No subscription."}
        </p>
      </div>
    </form>
  );
}
