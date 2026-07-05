"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push("/pipeline");
      router.refresh();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "signup" && (
        <>
          <div>
            <label className="t-label mb-2 block" htmlFor="name">Your name</label>
            <input id="name" name="name" className="input" required maxLength={120} />
          </div>
          <div>
            <label className="t-label mb-2 block" htmlFor="orgName">Team</label>
            <input id="orgName" name="orgName" className="input" required maxLength={120} />
          </div>
        </>
      )}
      <div>
        <label className="t-label mb-2 block" htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" className="input" required />
      </div>
      <div>
        <label className="t-label mb-2 block" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="input" required minLength={8} />
      </div>
      {error && <p className="text-sm text-[var(--color-coral)]">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "One moment" : mode === "login" ? "Log in" : "Start free trial"}
      </button>
    </form>
  );
}
