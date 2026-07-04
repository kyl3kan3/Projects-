"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

export function CardUpdateForm({ token, amountCents }: { token: string; amountCents: number }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function submit() {
    setStatus("saving");
    const response = await fetch("/api/card-update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });

    setStatus(response.ok ? "saved" : "error");
  }

  return (
    <>
      <div className="mt-6 space-y-3">
        <label className="block">
          <span className="t-label">Card number</span>
          <input className="input mt-2" value="4242 4242 4242 4242" readOnly />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="t-label">Expiry</span>
            <input className="input mt-2" value="12 / 29" readOnly />
          </label>
          <label className="block">
            <span className="t-label">CVC</span>
            <input className="input mt-2" value="123" readOnly />
          </label>
        </div>
      </div>
      <button className="btn btn-primary mt-6 w-full" disabled={status === "saving"} onClick={submit} type="button">
        {status === "saving" ? "Creating secure handoff" : `Update card and retry ${formatMoney(amountCents)}`}
      </button>
      <p className="t-secondary mt-3 text-center">
        {status === "saved"
          ? "Dry-run complete. In live mode Stripe would collect and attach the new payment method."
          : status === "error"
            ? "The update handoff could not be created. Try again in a moment."
            : "Dry-run mode: no card data leaves this page."}
      </p>
    </>
  );
}
