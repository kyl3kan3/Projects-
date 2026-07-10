"use client";
/** Deposit-first booking: pick a slot, enter details, send booking proposal.
 *  Confirms only when the deposit clears (stated in the flow). */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate, fmtTime, money } from "@/lib/format";

interface Slot { startsAt: string; endsAt: string; }
export function BookingFlow({ bookingTypeId, slots, priceCents, depositPercent }: { bookingTypeId: string; slots: Slot[]; priceCents: number; depositPercent: number }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deposit = Math.round((priceCents * depositPercent) / 100);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked) { setError("Pick a time first."); return; }
    setBusy(true); setError(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/public/book", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingTypeId, startsAt: picked, name: f.get("name"), email: f.get("email"), phone: f.get("phone"), partnerName: f.get("partnerName") }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.signUrl) { router.push(data.signUrl); }
    else if (res.ok) { router.push("/"); }
    else { setError(data.error ?? "Could not book"); setBusy(false); }
  }

  // group slots by day
  const byDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const day = new Date(s.startsAt).toDateString();
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(s);
  }

  return (
    <form onSubmit={submit}>
      <div className="max-h-72 overflow-y-auto">
        {[...byDay.entries()].slice(0, 8).map(([day, ds]) => (
          <div key={day} className="mb-4">
            <p className="t-placard mb-2" style={{ color: "#6b6a63" }}>{fmtDate(ds[0].startsAt)}</p>
            <div className="flex flex-wrap gap-2">
              {ds.slice(0, 8).map((s) => (
                <button type="button" key={s.startsAt} className="chip" data-active={picked === s.startsAt} style={{ color: "#3a3833" }} onClick={() => setPicked(s.startsAt)}>
                  {fmtTime(s.startsAt)}
                </button>
              ))}
            </div>
          </div>
        ))}
        {slots.length === 0 && <p className="text-sm" style={{ color: "#6b6a63" }}>No open times in the next few weeks — reach out directly.</p>}
      </div>

      <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: "#e2ded4" }}>
        <input name="name" required placeholder="Your name" className="input-underline" />
        <input name="email" type="email" required placeholder="Email" className="input-underline" />
        <input name="partnerName" placeholder="Partner's name (weddings)" className="input-underline" />
      </div>

      <div className="mt-5 flex items-baseline justify-between">
        <span className="t-placard" style={{ color: "#6b6a63" }}>Retainer to book</span>
        <span className="mono" style={{ color: "#1b1b19", fontSize: 15 }}>{depositPercent}% · {money(deposit)}</span>
      </div>
      {error && <p className="mt-2 text-sm" style={{ color: "#c96c55" }}>{error}</p>}
      <button className="btn btn-ink btn-block mt-4" disabled={busy}>{busy ? "Sending…" : "Send booking proposal"}</button>
      <p className="mt-2 text-center text-[13px]" style={{ color: "#6b6a63" }}>Booking confirms when the deposit clears.</p>
    </form>
  );
}
