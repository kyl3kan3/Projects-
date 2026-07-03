"use client";

import { useState } from "react";
import type { PlanId } from "@/lib/plans";

export function PlanControls({ currentPlan }: { currentPlan: PlanId }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function checkout(plan: PlanId) {
    setBusy(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error ?? "Checkout unavailable — configure Stripe price IDs.");
    } finally {
      setBusy(null);
    }
  }

  async function portal() {
    setBusy("portal");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error ?? "Portal unavailable.");
    } finally {
      setBusy(null);
    }
  }

  const isPaid = currentPlan !== "trial";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["starter", "pro", "team"] as const).map((p) => (
        <button
          key={p}
          onClick={() => checkout(p)}
          disabled={busy !== null || currentPlan === p}
          className="btn btn-ghost text-xs capitalize"
        >
          {busy === p ? "…" : currentPlan === p ? `${p} (current)` : `Upgrade to ${p}`}
        </button>
      ))}
      {isPaid && (
        <button onClick={portal} disabled={busy !== null} className="btn btn-ghost text-xs">
          {busy === "portal" ? "…" : "Manage billing"}
        </button>
      )}
    </div>
  );
}
