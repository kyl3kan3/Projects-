"use client";

/**
 * The review room. Clinicians live here, so this is the screen the product is
 * really about.
 *
 * At 390px the note sheet is full-width and the transcript sits behind a top tab,
 * with span tracing preserved across the flip; at >=768px it becomes the two-pane
 * it wants to be, transcript left, note right, spans tracing across the gutter.
 *
 * Tracing runs both ways and one pair is active at a time: tap a drafted sentence
 * and its transcript segments wash sage; tap a segment and the sentences citing it
 * underline. A model sentence with no surviving citation is flagged UNSOURCED
 * rather than quietly kept — that flag is the difference between a draft a
 * clinician can trust and one they cannot.
 *
 * Client component by necessity (selection state, inline editing, the sign sheet).
 * It imports `lib/trace` and `lib/format`, which are pure — nothing here can
 * reach the database client.
 */

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  regenerateSectionAction,
  retryPipelineAction,
  saveSectionAction,
  amendNoteAction,
} from "@/app/(app)/notes/actions";
import { SignGate } from "@/components/SignGate";
import {
  IconDownload,
  IconLinkSpan,
  IconLockSmall,
  IconPenNib,
} from "@/components/icons";
import {
  segmentsForSpans,
  sentencesForSegment,
  traceSection,
  type TracedSentence,
} from "@/lib/trace";
import { timecode, wordCount } from "@/lib/format";
import type { NoteSection } from "@/db/schema";

export interface ReviewSegment {
  speaker: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface ReviewSectionSpec {
  key: string;
  label: string;
  guidance: string;
}

export interface SignatureView {
  version: number;
  reason: string;
  signerName: string;
  credentials: string;
  stamp: string;
  hash: string;
  intact: boolean;
}

export interface ReviewRoomProps {
  noteId: string;
  status: "drafting" | "draft" | "signed" | "amended";
  clientLabel: string;
  templateName: string;
  heldAtLabel: string;
  metaLine: string;
  sectionSpecs: ReviewSectionSpec[];
  sections: NoteSection[];
  segments: ReviewSegment[];
  hasTranscript: boolean;
  transcriptNote: string | null;
  notices: string[];
  signatures: SignatureView[];
  signerName: string;
  signerCredentials: string;
  canAmend: boolean;
  amendmentNotice: string | null;
  /** Set when the pipeline gave up on this session, in words for a clinician. */
  failureReason: string | null;
  clockLabel: string;
  signedClockLabel: string | null;
  exportHref: string;
  plainText: string;
}

type Active = { sectionKey: string; index: number } | null;

export function ReviewRoom(props: ReviewRoomProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"note" | "transcript">("note");
  const [active, setActive] = useState<Active>(null);
  const [activeSegment, setActiveSegment] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState<SignatureView | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const locked = props.status === "signed";

  const traced = useMemo(() => {
    const map = new Map<string, TracedSentence[]>();
    for (const spec of props.sectionSpecs) {
      const section =
        props.sections.find((s) => s.key === spec.key) ??
        ({ key: spec.key, text: "", sourceSpans: [], sentences: [] } as NoteSection);
      map.set(
        spec.key,
        traceSection(section, { hasTranscript: props.hasTranscript }),
      );
    }
    return map;
  }, [props.sectionSpecs, props.sections, props.hasTranscript]);

  const activeSpans = useMemo(() => {
    if (!active) return [];
    const sentence = traced.get(active.sectionKey)?.[active.index];
    return sentence?.spans ?? [];
  }, [active, traced]);

  const litSegments = useMemo(
    () => new Set(segmentsForSpans(props.segments, activeSpans)),
    [props.segments, activeSpans],
  );

  const litSentences = useMemo(() => {
    if (activeSegment === null) return new Set<string>();
    const segment = props.segments[activeSegment];
    if (!segment) return new Set<string>();
    return new Set(
      sentencesForSegment(props.sections, segment, {
        hasTranscript: props.hasTranscript,
      }),
    );
  }, [activeSegment, props.segments, props.sections, props.hasTranscript]);

  const totalWords = props.sections.reduce((n, s) => n + wordCount(s.text), 0);
  const unsourced = [...traced.values()]
    .flat()
    .filter((s) => s.kind === "unsourced").length;

  function selectSentence(sectionKey: string, index: number) {
    setActiveSegment(null);
    setActive((current) =>
      current && current.sectionKey === sectionKey && current.index === index
        ? null
        : { sectionKey, index },
    );
  }

  function selectSegment(index: number) {
    setActive(null);
    setActiveSegment((current) => (current === index ? null : index));
  }

  function save(sectionKey: string) {
    const text = drafts[sectionKey];
    if (text === undefined) {
      setEditing(null);
      return;
    }
    setBusyKey(sectionKey);
    startTransition(async () => {
      const result = await saveSectionAction(props.noteId, sectionKey, text);
      setBusyKey(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setEditing(null);
      router.refresh();
    });
  }

  function regenerate(sectionKey: string) {
    setBusyKey(sectionKey);
    setError(null);
    startTransition(async () => {
      const result = await regenerateSectionAction(props.noteId, sectionKey);
      setBusyKey(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDrafts((d) => {
        const next = { ...d };
        delete next[sectionKey];
        return next;
      });
      router.refresh();
    });
  }

  async function copyPlainText() {
    try {
      await navigator.clipboard.writeText(props.plainText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("This browser would not allow copying. Use the PDF export instead.");
    }
  }

  /**
   * The freshly-signed signature is held locally so the four beats can play
   * immediately, then dropped once the server's own copy arrives — otherwise the
   * refresh renders the same signature twice.
   */
  const signatures =
    signed && !props.signatures.some((s) => s.version === signed.version)
      ? [...props.signatures, signed]
      : props.signatures;

  return (
    <main className="screen pt-6">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="t-h2">{props.clientLabel}</h1>
        <span className="clock-chip t-data" data-signed={Boolean(signed)}>
          {signed || props.signedClockLabel ? (
            <>
              <span style={{ color: "var(--color-ink-3)" }}>
                <IconLockSmall size={14} />
              </span>
              signed {props.signedClockLabel ?? props.clockLabel}
            </>
          ) : (
            <>ready {props.clockLabel}</>
          )}
        </span>
      </div>
      <p className="t-secondary">
        {props.templateName} · {props.heldAtLabel}
      </p>
      <p className="t-secondary mb-4">{props.metaLine}</p>

      {props.transcriptNote && (
        <p className="panel mb-3 p-3 t-secondary">{props.transcriptNote}</p>
      )}

      {props.notices.map((notice) => (
        <p
          key={notice}
          className="panel mb-3 p-3"
          style={{ color: "var(--color-amber-text)", fontSize: 13, lineHeight: 1.45 }}
        >
          {notice}
        </p>
      ))}

      {props.failureReason && (
        <div className="panel mb-3 p-4">
          <p className="t-title mb-1" style={{ color: "var(--color-red)" }}>
            This session could not be processed
          </p>
          <p className="t-secondary mb-3">{props.failureReason}</p>
          <div className="flex flex-wrap items-center gap-4">
            <RetryButton noteId={props.noteId} onError={setError} />
            <Link className="btn-quiet btn-quiet-sm" href="/capture">
              Write shorthand instead
            </Link>
          </div>
        </div>
      )}

      {unsourced > 0 && (
        <p className="panel mb-3 p-3" style={{ fontSize: 13, lineHeight: 1.45 }}>
          <strong>{unsourced}</strong> drafted sentence{unsourced === 1 ? "" : "s"} could
          not be traced to the transcript and {unsourced === 1 ? "is" : "are"} flagged
          below. Check {unsourced === 1 ? "it" : "them"} against the session, or delete{" "}
          {unsourced === 1 ? "it" : "them"}.
        </p>
      )}

      {error && (
        <p className="field-error mb-3" role="alert">
          {error}
        </p>
      )}

      {/* Tabs at phone width only; both panes show from 768px. */}
      <div className="chip-row mb-4 md:hidden">
        <button
          type="button"
          className="chip"
          aria-pressed={tab === "note"}
          onClick={() => setTab("note")}
        >
          Note
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={tab === "transcript"}
          onClick={() => setTab("transcript")}
        >
          Transcript
        </button>
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-6">
        {/* ---- transcript (left on desktop) ---- */}
        <section className={tab === "transcript" ? "" : "hidden md:block"}>
          <h2 className="t-label mb-2">Transcript</h2>
          {props.transcriptNote ? (
            <p className="t-secondary panel p-4">{props.transcriptNote}</p>
          ) : props.segments.length === 0 ? (
            <p className="t-secondary panel p-4">
              This session was captured as shorthand, so there is no recording to trace
              against. The draft expands your own words.
            </p>
          ) : (
            <div className="panel p-2">
              <p className="t-secondary px-2 pb-2 pt-1">
                Speaker roles are assigned by the transcription provider and may be
                wrong.
              </p>
              {props.segments.map((segment, i) => (
                <button
                  key={`${segment.startMs}-${i}`}
                  type="button"
                  className="segment"
                  data-active={litSegments.has(i) || activeSegment === i}
                  onClick={() => selectSegment(i)}
                >
                  <span className="t-data t-faint">
                    {timecode(segment.startMs)}{" "}
                    {segment.speaker === 0 ? "Clinician" : "Client"}
                  </span>
                  <span className="t-transcript mt-1 block">{segment.text}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ---- the note sheet (right on desktop) ---- */}
        <section className={tab === "note" ? "" : "hidden md:block"}>
          <h2 className="t-label mb-2">
            {locked ? "Signed note" : props.status === "amended" ? "Amendment" : "Draft"}
          </h2>
          <div className="note-sheet" data-locked={locked || Boolean(signed)}>
            {props.sectionSpecs.map((spec) => {
              const sentences = traced.get(spec.key) ?? [];
              const section = props.sections.find((s) => s.key === spec.key);
              const isEditing = editing === spec.key;
              const busy = busyKey === spec.key && pending;
              return (
                <div key={spec.key} className="note-section p-4">
                  {busy && (
                    <div className="regen-bar mb-3" aria-hidden="true">
                      <span />
                    </div>
                  )}
                  <p className="t-label mb-2">{spec.label}</p>

                  {isEditing ? (
                    <>
                      <textarea
                        className="input t-body"
                        rows={6}
                        value={drafts[spec.key] ?? section?.text ?? ""}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [spec.key]: e.target.value }))
                        }
                        onBlur={() => save(spec.key)}
                        autoFocus
                      />
                      <div className="mt-3 flex gap-4">
                        <button
                          type="button"
                          className="btn-quiet btn-quiet-sm"
                          onClick={() => save(spec.key)}
                        >
                          Save section
                        </button>
                        <button
                          type="button"
                          className="btn-quiet btn-quiet-sm"
                          style={{ color: "var(--color-ink-2)" }}
                          onClick={() => {
                            setDrafts((d) => {
                              const next = { ...d };
                              delete next[spec.key];
                              return next;
                            });
                            setEditing(null);
                          }}
                        >
                          Discard changes
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className={`t-body ${busy ? "crossfade" : ""}`}>
                      {sentences.length === 0 ? (
                        <span className="t-faint">
                          {props.status === "drafting"
                            ? "Drafting…"
                            : "Nothing drafted for this section yet."}
                        </span>
                      ) : (
                        sentences.map((sentence) => {
                          const key = `${spec.key}:${sentence.index}`;
                          const isActive =
                            (active?.sectionKey === spec.key &&
                              active.index === sentence.index) ||
                            litSentences.has(key);
                          return (
                            <span key={key}>
                              <span
                                className="sentence"
                                data-active={isActive}
                                data-kind={sentence.kind}
                                title={
                                  sentence.kind === "traced"
                                    ? "Traced to the transcript — tap to highlight"
                                    : sentence.kind === "unsourced"
                                      ? "UNSOURCED: the drafter cited no transcript span for this sentence"
                                      : sentence.kind === "clinician"
                                        ? "Your text — no source claimed"
                                        : "No recording for this session"
                                }
                                onClick={() => selectSentence(spec.key, sentence.index)}
                                role={sentence.spans.length ? "button" : undefined}
                                tabIndex={sentence.spans.length ? 0 : undefined}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    selectSentence(spec.key, sentence.index);
                                  }
                                }}
                              >
                                {sentence.text}
                              </span>{" "}
                            </span>
                          );
                        })
                      )}
                    </p>
                  )}

                  {!locked && !isEditing && (
                    <div className="mt-3 flex flex-wrap gap-4">
                      <button
                        type="button"
                        className="btn-quiet btn-quiet-sm"
                        onClick={() => setEditing(spec.key)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-quiet btn-quiet-sm"
                        onClick={() => regenerate(spec.key)}
                        disabled={pending}
                      >
                        Regenerate
                      </button>
                      {props.hasTranscript && (
                        <button
                          type="button"
                          className="btn-quiet btn-quiet-sm"
                          onClick={() => {
                            const first = (traced.get(spec.key) ?? []).findIndex(
                              (s) => s.spans.length > 0,
                            );
                            if (first >= 0) {
                              selectSentence(spec.key, first);
                              setTab("transcript");
                            }
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            <IconLinkSpan size={16} /> Trace
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {signatures.length > 0 && (
              <div className="note-section p-4">
                {signatures.map((sig, i) => (
                  <div
                    key={`${sig.version}-${i}`}
                    className={
                      signed && i === signatures.length - 1 ? "sig-draw" : undefined
                    }
                  >
                    <svg
                      viewBox="0 0 160 26"
                      width="160"
                      height="26"
                      aria-hidden="true"
                      className="mb-1 block"
                    >
                      <path
                        className="sig-line"
                        d="M4 18 C 22 2 36 24 54 12 C 68 2 84 22 104 14 C 118 8 132 16 156 8"
                      />
                    </svg>
                    <p className="t-title">
                      {sig.signerName}, {sig.credentials}
                    </p>
                    <p
                      className={`t-data t-faint ${signed && i === signatures.length - 1 ? "sig-hash" : ""}`}
                    >
                      {sig.reason === "amendment" ? "amended" : "signed"} v{sig.version} ·{" "}
                      {sig.stamp} · {sig.hash.slice(0, 4)}…{sig.hash.slice(-4)}
                    </p>
                    {!sig.intact && (
                      <p className="field-error">
                        Stored content no longer matches this signature.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {(locked || signed) && (
            <div className="mt-4 flex flex-wrap gap-4">
              {/* A plain anchor: prefetching a Link here would run the export
                  and audit it before the clinician clicked. */}
              <a className="btn-quiet btn-quiet-sm" href={props.exportHref} download>
                <span className="inline-flex items-center gap-1">
                  <IconDownload size={16} /> Signed PDF
                </span>
              </a>
              <button
                type="button"
                className="btn-quiet btn-quiet-sm"
                onClick={copyPlainText}
              >
                {copied ? "Copied" : "Copy for your EHR"}
              </button>
              <AmendButton
                noteId={props.noteId}
                canAmend={props.canAmend}
                notice={props.amendmentNotice}
                onError={setError}
                // Clearing the just-signed state is what brings the sticky
                // "Sign note" bar back for the amendment: without it the
                // clinician had to reload before they could sign what they had
                // just opened.
                onAmended={() => setSigned(null)}
              />
            </div>
          )}
        </section>
      </div>

      {!locked && !signed && (
        <div className="sticky-action">
          <div className="mb-2 flex items-center justify-between">
            <span className="t-secondary">{totalWords} words</span>
            <span className="t-secondary">
              {props.status === "amended" ? "amendment unsigned" : "draft unsigned"}
            </span>
          </div>
          <button
            className="btn btn-primary btn-full"
            type="button"
            onClick={() => setGateOpen(true)}
            disabled={props.status === "drafting" || totalWords === 0}
          >
            <span className="inline-flex items-center gap-2">
              <IconPenNib size={18} /> Sign note
            </span>
          </button>
        </div>
      )}

      {gateOpen && (
        <SignGate
          noteId={props.noteId}
          signerName={props.signerName}
          signerCredentials={props.signerCredentials}
          isAmendment={props.status === "amended"}
          onClose={() => setGateOpen(false)}
          onSigned={(result) => {
            setGateOpen(false);
            setSigned({
              version: result.version,
              reason: props.status === "amended" ? "amendment" : "edit",
              signerName: props.signerName,
              credentials: props.signerCredentials,
              stamp: result.stamp,
              hash: result.contentHash,
              intact: true,
            });
            // Let the four beats play, then reconcile with the server.
            window.setTimeout(() => router.refresh(), 1000);
          }}
        />
      )}
    </main>
  );
}

function RetryButton({
  noteId,
  onError,
}: {
  noteId: string;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await retryPipelineAction(noteId);
          if (result.error) onError(result.error);
          else router.refresh();
        })
      }
    >
      {pending ? "Queued…" : "Try again"}
    </button>
  );
}

/**
 * Amend is record-heavy, so it is hold-to-confirm (600ms) per DESIGN.md — and it
 * is always audit-logged. The signed version it opens from is never altered.
 */
function AmendButton({
  noteId,
  canAmend,
  notice,
  onError,
  onAmended,
}: {
  noteId: string;
  canAmend: boolean;
  notice: string | null;
  onError: (message: string) => void;
  onAmended: () => void;
}) {
  const router = useRouter();
  const [holding, setHolding] = useState(false);
  const [pending, startTransition] = useTransition();
  /**
   * The hold is tracked in a ref, not read back inside a state updater. Starting a
   * transition from inside `setState(prev => …)` is not a pure update, and React 19
   * throws a client-side exception for it — which took the whole review room down
   * the first time this ran in a browser. The ref keeps the updater pure.
   */
  const holdingRef = useRef(false);

  if (!canAmend) {
    return <span className="t-secondary">{notice ?? "Amendments need Caseload."}</span>;
  }

  const cancel = () => {
    holdingRef.current = false;
    setHolding(false);
  };

  const begin = () => {
    holdingRef.current = true;
    setHolding(true);
    window.setTimeout(() => {
      if (!holdingRef.current) return;
      cancel();
      startTransition(async () => {
        const result = await amendNoteAction(noteId);
        if (result.error) {
          onError(result.error);
          return;
        }
        onAmended();
        router.refresh();
      });
    }, 600);
  };

  return (
    <button
      type="button"
      className="btn-quiet btn-quiet-sm"
      style={{ color: holding ? "var(--color-ink)" : undefined }}
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      disabled={pending}
    >
      {pending ? "Opening…" : holding ? "Hold to amend…" : "Amend (hold)"}
    </button>
  );
}
