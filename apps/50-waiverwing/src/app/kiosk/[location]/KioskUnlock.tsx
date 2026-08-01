"use client";

import { useActionState } from "react";
import { Blaze } from "@/components/Blaze";
import { unlockKioskAction, type KioskState } from "./actions";

export function KioskUnlock({
  locationId,
  venueName,
}: {
  locationId: string;
  venueName: string;
}) {
  const [state, action, pending] = useActionState<KioskState, FormData>(unlockKioskAction, {});

  return (
    <main className="kiosk mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-8">
      <div className="flex items-center gap-2">
        <Blaze size={26} draw={false} />
        <span className="t-label">{venueName}</span>
      </div>
      <h1 className="t-h2 mt-6">Staff PIN</h1>
      <p className="kiosk-body mt-2" style={{ color: "var(--color-text-2)" }}>
        Enter the kiosk PIN once to put this tablet into kiosk mode. It stays unlocked until you
        clear it, and it can only take waivers for this location.
      </p>

      <form action={action} className="mt-8 flex flex-col gap-4">
        <input type="hidden" name="locationId" value={locationId} />
        <input
          name="pin"
          className="input input-mono text-center"
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••"
          maxLength={8}
          required
          aria-label="Kiosk PIN"
        />
        {state.error ? (
          <p className="t-secondary" style={{ color: "var(--color-ember)" }} role="alert">
            {state.error}
          </p>
        ) : null}
        <button className="btn btn-primary btn-full btn-kiosk" type="submit" disabled={pending}>
          {pending ? "Unlocking…" : "Unlock kiosk mode"}
        </button>
      </form>

      <p className="t-secondary mt-8">
        Then add this page to the tablet&rsquo;s home screen — it runs full-screen from there and
        keeps taking waivers when the Wi-Fi drops.
      </p>
    </main>
  );
}
