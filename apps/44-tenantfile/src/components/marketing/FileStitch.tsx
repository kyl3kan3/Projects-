"use client";

/**
 * The hero: a tenancy's file assembling itself.
 *
 * This is the product's own signature detail — the file-line stitch from
 * DESIGN.md — running once on entry as the marketing page's first motion beat.
 * It is HTML and CSS, no canvas and no library, so the LCP is text and the whole
 * thing costs nothing on a mid Android.
 *
 * It is a staged demo, and it says so underneath rather than implying these are
 * somebody's real records.
 */

import { useEffect, useState } from "react";
import {
  IconBell,
  IconCheck,
  IconKey,
  IconLedger,
  IconShieldCheck,
  IconSignature,
  IconWrench,
} from "@/components/icons";

const EVENTS = [
  { date: "12 AUG", kind: "application", text: "M. Alvarez applied for 114 Maple St, 2B", amount: "" },
  { date: "14 AUG", kind: "screening", text: "Screening authorised by the applicant", amount: "" },
  { date: "18 AUG", kind: "lease", text: "Lease signed by both parties on their phones", amount: "" },
  { date: "18 AUG", kind: "charge", text: "Deposit and prorated first month charged", amount: "$3,043.55" },
  { date: "29 AUG", kind: "reminder", text: "Rent reminder sent — 3 days before due", amount: "" },
  { date: "01 SEP", kind: "payment", text: "Rent paid by bank transfer", amount: "$1,850.00" },
  { date: "14 SEP", kind: "request", text: "Kitchen tap fixed — 2 photos on the thread", amount: "$145.00" },
] as const;

function Glyph({ kind }: { kind: string }) {
  switch (kind) {
    case "application":
      return <IconKey size={18} />;
    case "screening":
      return <IconShieldCheck size={18} />;
    case "lease":
      return <IconSignature size={18} />;
    case "charge":
      return <IconLedger size={18} />;
    case "reminder":
      return <IconBell size={18} />;
    case "payment":
      return <IconCheck size={18} />;
    default:
      return <IconWrench size={18} />;
  }
}

export function FileStitch() {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(EVENTS.length);
      return;
    }
    // DESIGN.md rate-limits the stitch to one per second, batches capped at four;
    // the hero runs the whole file at 550ms so it lands inside five seconds.
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= EVENTS.length) clearInterval(timer);
    }, 550);
    setShown(1);
    return () => clearInterval(timer);
  }, []);

  return (
    <figure className="card m-0 p-4">
      <figcaption className="t-label mb-4">The File · 114 Maple Street, 2B</figcaption>
      <ol className="fileline m-0 list-none p-0">
        {EVENTS.map((event, i) => (
          <li
            key={event.text}
            className="file-node"
            data-stitch={i < shown ? "true" : undefined}
            style={{ visibility: i < shown ? "visible" : "hidden" }}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2" style={{ color: "var(--color-text-3)" }}>
                  <Glyph kind={event.kind} />
                  <span className="t-data">{event.date}</span>
                </div>
                <p className="t-body mt-1">{event.text}</p>
              </div>
              {event.amount ? <span className="t-data whitespace-nowrap pt-1">{event.amount}</span> : null}
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}
