"use client";
import { useState } from "react";
export function BillingButton({ plan, current }: { plan: "solo" | "studio" | "pro"; current: string }) {
  const [busy, setBusy] = useState(false);
  const isCurrent = current === plan;
  async function go() {
    setBusy(true);
    const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
    const data = await res.json().catch(() => ({}));
    if (data.url) window.location.href = data.url; else setBusy(false);
  }
  return <button className={`btn btn-block ${isCurrent ? "btn-secondary" : "btn-primary"}`} disabled={busy || isCurrent} onClick={go}>{isCurrent ? "Current plan" : busy ? "One moment" : "Choose"}</button>;
}
export function LogoutButton() {
  return <button className="btn btn-secondary btn-sm" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/"; }}>Log out</button>;
}
