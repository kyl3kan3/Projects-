"use client";
/** Lead pipeline: hairline rows grouped by stage; advance via the stage menu
 *  (swipe on touch is a fast-follow). Optimistic PATCH. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDay } from "@/lib/format";
const STAGES = ["inquiry", "consult", "proposal", "booked", "lost"] as const;
const LABEL: Record<string, string> = { inquiry: "INQUIRY", consult: "CONSULT", proposal: "PROPOSAL", booked: "BOOKED", lost: "LOST" };
interface Lead { id: string; name: string; shootType: string | null; stage: string; createdAt: string; message: string | null; }
export function LeadPipeline({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [items, setItems] = useState(leads);
  async function advance(id: string, stage: string) {
    setItems((xs) => xs.map((l) => (l.id === id ? { ...l, stage } : l)));
    await fetch(`/api/leads/${id}/stage`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) });
    router.refresh();
  }
  if (items.length === 0) return <p className="t-secondary py-8">No leads yet. Share a lead form and inquiries land here.</p>;
  return (
    <div className="rowlist">
      {items.map((l) => (
        <div key={l.id} className="py-4">
          <div className="flex items-center gap-3">
            <span className="t-title min-w-0 flex-1 truncate">{l.name}</span>
            <span className={`pill ${l.stage === "booked" ? "pill-fern" : l.stage === "lost" ? "pill-clay" : "pill-brass"}`}><span className="dot" />{LABEL[l.stage]}</span>
            <span className="mono text-[var(--color-text-3)]">{fmtDay(l.createdAt)}</span>
          </div>
          {l.message && <p className="t-secondary mt-1 line-clamp-1">{l.message}</p>}
          <div className="mt-2 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {STAGES.filter((s) => s !== l.stage).map((s) => (
              <button key={s} className="chip btn-sm" style={{ height: 30 }} onClick={() => advance(l.id, s)}>→ {LABEL[s]}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
