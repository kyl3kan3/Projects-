"use client";
import { useState } from "react";
export function LeadFormClient({ formSlug, successMessage }: { formSlug: string; successMessage: string }) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/public/lead", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formSlug, name: f.get("name"), email: f.get("email"), phone: f.get("phone"), eventDate: f.get("eventDate"), message: f.get("message"), website: f.get("website") }),
    });
    if (res.ok) setDone(true); else setBusy(false);
  }
  if (done) return <p className="text-center text-[16px]" style={{ color: "#3a3833" }}>{successMessage}</p>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <input name="name" required placeholder="Your name" className="input-underline" />
      <input name="email" type="email" required placeholder="Email" className="input-underline" />
      <input name="phone" placeholder="Phone (optional)" className="input-underline" />
      <input name="eventDate" placeholder="Event / preferred date" className="input-underline" />
      <textarea name="message" rows={3} placeholder="Tell me about your shoot" className="input-underline" style={{ resize: "none" }} />
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <button className="btn btn-ink btn-block" disabled={busy}>{busy ? "Sending…" : "Send inquiry"}</button>
    </form>
  );
}
