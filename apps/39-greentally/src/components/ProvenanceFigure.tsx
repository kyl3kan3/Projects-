"use client";

/**
 * The signature interaction.
 *
 * A figure is a button. Tapping it draws a 1px moss thread downward from the digit over
 * 240ms and pins a provenance sheet: the source line, the factor with its vintage, and
 * the arithmetic — all in mono. The figure keeps a 1.5px moss underline while the thread
 * is open, and dismissing retracts it in 160ms.
 *
 * The thread data is rendered by the server into the page, so opening it is instant and
 * works with no network. Under `prefers-reduced-motion` the sheet simply appears with
 * the thread already drawn (see globals.css) — the content is identical, which is the
 * rule: nothing in this product is carried by motion alone.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconClose, IconThread } from "@/components/icons";

export interface ProvenanceEntryView {
  source: string;
  sourceDetail: string;
  factor: string;
  factorCitation: string;
  arithmetic: string;
  documentId: string | null;
  documentName: string | null;
}

export interface ProvenanceThreadView {
  title: string;
  figure: string;
  entries: ProvenanceEntryView[];
  more: number;
  note: string;
}

export function ProvenanceFigure({
  children,
  thread,
  grounded = true,
  label,
}: {
  children: React.ReactNode;
  thread: ProvenanceThreadView;
  grounded?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function close() {
    setClosing(true);
    timer.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 160);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const empty = thread.entries.length === 0;

  return (
    <>
      <button
        type="button"
        className="figure-button"
        data-open={open || undefined}
        data-grounded={grounded || undefined}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {children}
        <span className="sr-only"> — show where {label} came from</span>
      </button>

      {open && (
        <div ref={sheetRef}>
          <span className="thread" aria-hidden="true" />
          <div
            className="panel prov-sheet mt-1 p-4"
            data-closing={closing || undefined}
            role="region"
            aria-label={`Provenance for ${label}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="t-label">{thread.title}</p>
                <p className="t-mono mt-1 text-[15px] font-medium">{thread.figure}</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close provenance"
                className="flex h-11 w-11 items-center justify-center"
                style={{ color: "var(--color-fg-2)", marginTop: "-8px", marginRight: "-8px" }}
              >
                <IconClose size={18} />
              </button>
            </div>

            {thread.note && (
              <p className="t-secondary mt-2" style={{ maxWidth: "60ch" }}>
                {thread.note}
              </p>
            )}

            {empty ? (
              <p className="t-secondary mt-4">
                Nothing has been computed for this figure yet. Upload a bill and it will
                appear here with its factor and arithmetic.
              </p>
            ) : (
              <ul className="mt-4">
                {thread.entries.map((e, i) => (
                  <li key={`${e.source}-${i}`} className="row-plain first:pt-0 last:border-b-0">
                    <div className="flex items-start gap-2">
                      <span style={{ color: "var(--color-moss)", marginTop: 2 }}>
                        <IconThread size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="t-title">{e.source}</p>
                        {e.sourceDetail && (
                          <p className="t-data mt-1" style={{ color: "var(--color-fg-2)" }}>
                            {e.sourceDetail}
                          </p>
                        )}
                        <p className="t-data mt-2" style={{ color: "var(--color-accent-text)" }}>
                          {e.factor}
                        </p>
                        {e.arithmetic && (
                          <p className="t-data mt-1">{e.arithmetic}</p>
                        )}
                        {e.factorCitation && (
                          <p className="report-note mt-2" style={{ maxWidth: "58ch" }}>
                            {e.factorCitation}
                          </p>
                        )}
                        {e.documentId && (
                          <Link
                            href={`/review/${e.documentId}`}
                            className="t-secondary mt-2 inline-block"
                            style={{ color: "var(--color-accent-text)", fontWeight: 600 }}
                          >
                            {e.documentName ?? "Open the source document"}
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {thread.more > 0 && (
              <p className="t-secondary mt-3">
                {thread.more} further source {thread.more === 1 ? "line" : "lines"} contribute to
                this figure; the largest are shown.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
