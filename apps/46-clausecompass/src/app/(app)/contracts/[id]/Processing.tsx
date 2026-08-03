"use client";

/**
 * The processing screen: the pipeline's real stages, ticking as they finish.
 *
 * It is not a fake progress bar. Each poll runs exactly one stage on the server and
 * returns the contract's new status, so a tick appearing means that stage genuinely
 * completed. The counts beside the steps are the document's own numbers.
 *
 * Closing this tab does not lose the review — `/api/cron/tick` sweeps anything left
 * mid-pipeline — which is why the failure copy can promise the credit back rather than
 * asking the reader to keep the tab open.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { advanceReviewAction } from "../actions";
import { IconAlertTriangle, IconCheck } from "@/components/icons";
import type { ContractStatus } from "@/db/schema";

const STEPS: Array<{ status: ContractStatus; label: string }> = [
  { status: "extracting", label: "Mapping the clauses" },
  { status: "scoring", label: "Scoring against your playbook" },
  { status: "explaining", label: "Writing the plain-English read" },
];

const ORDER: ContractStatus[] = ["uploaded", "parsing", "extracting", "scoring", "explaining", "ready"];

export function Processing({
  contractId,
  initialStatus,
  pageCount,
  sections,
  failureReason,
}: {
  contractId: string;
  initialStatus: ContractStatus;
  pageCount: number;
  sections: number;
  failureReason: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ContractStatus>(initialStatus);
  const [detail, setDetail] = useState<string>(failureReason ?? "");
  const running = useRef(false);

  useEffect(() => {
    if (status === "ready" || status === "failed") return;
    let cancelled = false;

    const tick = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const progress = await advanceReviewAction(contractId);
        if (cancelled) return;
        setStatus(progress.status);
        setDetail(progress.detail);
        if (progress.done) router.refresh();
      } catch (err) {
        console.error("[processing] advance failed", err);
      } finally {
        running.current = false;
      }
    };

    void tick();
    const timer = setInterval(tick, 1200);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [contractId, status, router]);

  if (status === "failed") {
    return (
      <section className="mt-8">
        <div className="card p-6">
          <span style={{ color: "var(--color-oxblood)" }}>
            <IconAlertTriangle size={20} />
          </span>
          <h2 className="t-title mt-3">This review stopped before it finished</h2>
          <p className="t-body mt-2" style={{ color: "var(--color-text-2)" }}>
            {detail || "Something went wrong part-way through."}
          </p>
          <p className="t-secondary mt-3">
            Your review credit has been put back on your account, so this cost you nothing.
          </p>
          <a href="/contracts/new" className="btn btn-primary mt-5" style={{ width: "100%" }}>
            Try again
          </a>
        </div>
      </section>
    );
  }

  const currentIndex = ORDER.indexOf(status);

  return (
    <section className="mt-8" aria-live="polite">
      <p className="t-data" style={{ color: "var(--color-text-2)" }}>
        {pageCount} {pageCount === 1 ? "PAGE" : "PAGES"} · {sections} SECTIONS
      </p>
      <ul className="mt-5" style={{ listStyle: "none", padding: 0 }}>
        {STEPS.map((step) => {
          const stepIndex = ORDER.indexOf(step.status);
          const done = currentIndex > stepIndex;
          const active = currentIndex === stepIndex;
          return (
            <li
              key={step.status}
              className="flex items-center gap-3"
              style={{ minHeight: 44, color: done || active ? "var(--color-ink)" : "var(--color-text-3)" }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  flex: "none",
                  color: done ? "var(--color-sage)" : "var(--color-faint-line)",
                }}
              >
                {done ? (
                  <span className="check-draw">
                    <IconCheck size={20} />
                  </span>
                ) : (
                  <span
                    style={{
                      display: "block",
                      width: 6,
                      height: 6,
                      margin: "7px",
                      borderRadius: "50%",
                      background: active ? "var(--color-oxblood)" : "var(--color-faint-line)",
                    }}
                  />
                )}
              </span>
              <span className="t-body">{step.label}</span>
            </li>
          );
        })}
      </ul>
      <p className="t-secondary mt-4">{detail || "Reading the document."}</p>
    </section>
  );
}
