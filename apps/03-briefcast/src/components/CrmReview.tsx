"use client";

/**
 * The wedge, made tangible: per-field CRM change rows with old→new, a
 * per-field approve toggle, and a sync bar. On apply, chips split-flap from
 * the field name to green "Synced" — once, never looping (DESIGN.md motion).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconSync } from "@/components/icons";

interface Change {
  id: string;
  label: string;
  oldValue: string | null;
  newValue: string;
  confidence: number | null;
}

export function CrmReview({ changes, connected }: { changes: Change[]; connected: boolean }) {
  const router = useRouter();
  const [approved, setApproved] = useState<Record<string, boolean>>(
    Object.fromEntries(changes.map((c) => [c.id, c.confidence != null && c.confidence >= 85])),
  );
  const [synced, setSynced] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const count = Object.entries(approved).filter(([id, on]) => on && !synced[id]).length;

  async function apply() {
    setBusy(true);
    const toApply = Object.entries(approved).filter(([id, on]) => on && !synced[id]);
    for (const [id] of toApply) {
      const res = await fetch(`/api/sync/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply" }),
      });
      if (res.ok) setSynced((s) => ({ ...s, [id]: true }));
    }
    setBusy(false);
    router.refresh();
  }

  if (!connected) {
    return (
      <div className="card p-4">
        <p className="t-label">Ready to write back</p>
        <p className="t-body mt-2 text-[15px]">
          {changes.length} field {changes.length === 1 ? "update" : "updates"} were proposed from this call.
          Connect HubSpot to review and apply them.
        </p>
        <a href="/api/crm/hubspot" className="btn btn-primary btn-block mt-4">Connect HubSpot</a>
      </div>
    );
  }

  return (
    <div>
      <div className="rowlist">
        {changes.map((c) => (
          <div key={c.id} className="py-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="t-label">{c.label}</span>
              {!synced[c.id] ? (
                <button
                  className="approve-toggle"
                  data-on={approved[c.id]}
                  onClick={() => setApproved((s) => ({ ...s, [c.id]: !s[c.id] }))}
                  aria-label={`Approve ${c.label}`}
                >
                  <span className="knob" />
                </button>
              ) : (
                <span className="pill pill-green">
                  <IconSync size={13} /> Synced
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[15px]">
              {c.oldValue ? <span className="field-old">{c.oldValue}</span> : <span className="text-[var(--color-stone-2)]">empty</span>}
              <IconArrowRight size={16} className="text-[var(--color-stone-2)]" />
              <span className="font-medium">{c.newValue}</span>
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-primary btn-block mt-4" disabled={busy || count === 0} onClick={apply}>
        <IconSync size={18} />
        {count === 0 ? "All changes synced" : `Apply ${count} ${count === 1 ? "change" : "changes"} to HubSpot`}
      </button>
    </div>
  );
}
