"use client";

/**
 * The clause map and the detail that opens beneath a row: the quote block in serif, our
 * explanation in sans, and the redline card carrying the signature draw.
 *
 * DESIGN.md's signature: "the oxblood strikethrough draws across the original phrase
 * left→right in 320ms, and the suggested language rises in beneath it. One draw at a
 * time, on scroll-into-view or tap, once per clause per session."
 *
 * The "once per session" part is what makes it a signature rather than a tic, so a Set of
 * already-drawn ids lives here and the animation is never replayed for the same clause.
 * The struck text and the suggestion are both fully present in the DOM either way —
 * reduced motion and print show the same information without the movement.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { SeverityChip } from "@/components/SeverityChip";
import {
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconGavelOut,
  IconSearchMissing,
} from "@/components/icons";

export interface RedlineData {
  id: string;
  originalPhrase: string;
  suggestedText: string;
  rationale: string;
  emailSnippet: string;
  accepted: boolean;
}

export interface FlagData {
  id: string;
  ruleKey: string;
  title: string;
  severity: "ok" | "caution" | "high";
  firedBecause: string;
  explanation: string | null;
  forYou: string | null;
  market: string | null;
  lawyerPointer: boolean;
  explanationSource: string;
  redline: RedlineData | null;
}

export interface ClauseRowData {
  id: string;
  kind: "clause" | "missing";
  label: string;
  citation: string | null;
  severity: "ok" | "caution" | "high";
  summary: string;
  quote: string | null;
  confidence: number;
  flags: FlagData[];
}

export function ClauseMap({
  rows,
  lawyerPointerText,
  onToggleRedline,
}: {
  rows: ClauseRowData[];
  lawyerPointerText: string;
  onToggleRedline?: (redlineId: string, accepted: boolean) => Promise<void>;
}) {
  const [open, setOpen] = useState<string | null>(rows.find((r) => r.severity === "high")?.id ?? null);
  const [drawn, setDrawn] = useState<Set<string>>(new Set());

  const markDrawn = useCallback((id: string) => {
    setDrawn((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  return (
    <div>
      {rows.map((row, i) => {
        const isOpen = open === row.id;
        return (
          <div key={row.id} className="enter" style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}>
            <button
              type="button"
              className="row"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : row.id)}
            >
              <span
                className="t-data"
                style={{ color: "var(--color-text-3)", minWidth: 66, flex: "none" }}
              >
                {row.citation ?? "—"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-title flex items-center gap-1.5">
                  {row.kind === "missing" && (
                    <span style={{ color: "var(--color-text-3)" }}>
                      <IconSearchMissing size={18} />
                    </span>
                  )}
                  {row.label}
                </span>
                <span className="t-secondary block truncate" style={{ color: "var(--color-text-3)" }}>
                  {row.summary}
                </span>
              </span>
              <SeverityChip severity={row.severity} missing={row.kind === "missing"} />
              <span style={{ color: "var(--color-text-3)" }}>
                {isOpen ? <IconChevronDown size={20} /> : <IconChevronRight size={20} />}
              </span>
            </button>

            {isOpen && (
              <div className="expand pb-8 pt-4">
                {row.quote ? (
                  <blockquote className="quote">
                    <p className="quote-text">{row.quote}</p>
                    <p className="quote-cite">{row.citation}</p>
                  </blockquote>
                ) : (
                  <p className="t-secondary" style={{ color: "var(--color-text-3)" }}>
                    No clause of this kind appears in the document, so there is nothing to
                    quote. That absence is the finding.
                  </p>
                )}

                {row.flags.length === 0 && (
                  <div className="mt-5">
                    <p className="t-label">Playbook</p>
                    <p className="t-body mt-1.5">
                      No rule in your playbook fired on this clause. It reads as ordinary for
                      this kind of agreement.
                    </p>
                  </div>
                )}

                {row.flags.map((flag) => (
                  <FlagDetail
                    key={flag.id}
                    flag={flag}
                    drawn={drawn.has(flag.id)}
                    onDraw={() => markDrawn(flag.id)}
                    lawyerPointerText={lawyerPointerText}
                    onToggleRedline={onToggleRedline}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FlagDetail({
  flag,
  drawn,
  onDraw,
  lawyerPointerText,
  onToggleRedline,
}: {
  flag: FlagData;
  drawn: boolean;
  onDraw: () => void;
  lawyerPointerText: string;
  onToggleRedline?: (redlineId: string, accepted: boolean) => Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [accepted, setAccepted] = useState(flag.redline?.accepted ?? false);

  // Scroll-into-view draws the strike, once. IntersectionObserver rather than a scroll
  // handler so it costs nothing on a phone.
  useEffect(() => {
    if (drawn || !ref.current) return;
    const el = ref.current;
    // No observer (an old browser, a test harness, a print preview) means the redline is
    // simply there. The animation is decoration; the struck phrase is the content.
    if (typeof IntersectionObserver === "undefined") {
      onDraw();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onDraw();
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [drawn, onDraw]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div ref={ref} className="mt-6">
      <div className="flex items-start gap-2">
        <SeverityChip severity={flag.severity} />
        <p className="t-title" style={{ paddingTop: 4 }}>
          {flag.title}
        </p>
      </div>
      <p className="t-body mt-2">{flag.firedBecause}</p>

      <div className="mt-5">
        {flag.explanation && (
          <div className="explain-section">
            <p className="t-label">What it says</p>
            <p className="t-body mt-1.5">{flag.explanation}</p>
          </div>
        )}
        {flag.forYou && (
          <div className="explain-section">
            <p className="t-label">What it means for you</p>
            <p className="t-body mt-1.5">{flag.forYou}</p>
          </div>
        )}
        {flag.market && (
          <div className="explain-section">
            <p className="t-label">Market</p>
            <p className="t-body mt-1.5">{flag.market}</p>
          </div>
        )}
        {flag.lawyerPointer && (
          <div className="explain-section">
            <p className="t-label" style={{ color: "var(--color-oxblood)" }}>
              Worth a lawyer
            </p>
            <p className="t-body mt-1.5 flex items-start gap-2">
              <span style={{ color: "var(--color-oxblood)", marginTop: 3 }}>
                <IconGavelOut size={18} />
              </span>
              <span>{lawyerPointerText}</span>
            </p>
          </div>
        )}
      </div>

      {flag.redline && (
        <div className="redline-card mt-5">
          <p className="t-label">Suggested redline</p>
          {flag.redline.originalPhrase && (
            <p className="mt-2">
              <span className="redline-original strike-wrap">
                <span>{flag.redline.originalPhrase}</span>
                <span className="strike-over" data-drawn={drawn} aria-hidden="true">
                  {flag.redline.originalPhrase}
                </span>
              </span>
            </p>
          )}
          <div className="rise mt-3" data-drawn={drawn}>
            <p className="redline-suggested">{flag.redline.suggestedText}</p>
            <p className="t-secondary mt-2">{flag.redline.rationale}</p>
            <div className="mt-4 flex items-center gap-6">
              <button
                type="button"
                className="btn-quiet btn-quiet-sm"
                onClick={() => copy(flag.redline!.suggestedText)}
              >
                <IconCopy size={18} />
                {copied ? "Copied" : "Copy"}
              </button>
              {onToggleRedline && (
                <button
                  type="button"
                  className="btn-quiet btn-quiet-sm"
                  aria-pressed={accepted}
                  onClick={async () => {
                    const next = !accepted;
                    setAccepted(next);
                    await onToggleRedline(flag.redline!.id, next);
                  }}
                >
                  {accepted ? "In the email" : "Add to email"}
                </button>
              )}
            </div>
          </div>
          {flag.explanationSource !== "generated" && (
            <p className="t-label mt-4" style={{ letterSpacing: "0.06em" }}>
              Wording from your playbook&rsquo;s own template
            </p>
          )}
        </div>
      )}
    </div>
  );
}
