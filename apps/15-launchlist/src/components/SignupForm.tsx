"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconMail } from "@/components/icons";

/**
 * The signup form on a hosted page — the control the whole product turns on.
 *
 * Input first, always; button below in the thumb zone. On submit the input's
 * 2px underline ignites left → right in the accent while the button compresses;
 * confirmation settles in one sequence. No confetti, ever (DESIGN.md).
 */

export interface SignupFormProps {
  slug: string;
  ctaLabel: string;
  refCode?: string | null;
  /** The builder preview renders the real control but must not create rows. */
  disabled?: boolean;
  source?: "page" | "widget";
}

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "check-email"; email: string }
  | { kind: "already" }
  | { kind: "error"; message: string };

export function SignupForm({ slug, ctaLabel, refCode, disabled, source = "page" }: SignupFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const igniting = state.kind === "sending";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled) return;
    setState({ kind: "sending" });

    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, email, ref: refCode ?? null, source }),
      });
      const data = (await response.json()) as {
        outcome?: string;
        message?: string;
        positionUrl?: string;
      };

      if (!response.ok) {
        setState({ kind: "error", message: data.message ?? "Something went wrong. Try again." });
        return;
      }
      if (data.outcome === "joined" && data.positionUrl) {
        router.push(data.positionUrl);
        return;
      }
      if (data.outcome === "duplicate") {
        setState({ kind: "already" });
        return;
      }
      setState({ kind: "check-email", email });
    } catch {
      setState({
        kind: "error",
        message: "We couldn't reach the server. Check your connection and try again.",
      });
    }
  }

  if (state.kind === "check-email") {
    return (
      <div role="status" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ color: "var(--color-mint)", display: "inline-flex" }}>
          <IconMail size={20} />
        </span>
        <p className="t-title">Confirm your email to take your place.</p>
        <p className="t-secondary">
          We sent a one-click link to {state.email}. Unconfirmed addresses don&apos;t hold a
          position and don&apos;t earn anyone a spot — that&apos;s what keeps the queue honest.
        </p>
      </div>
    );
  }

  if (state.kind === "already") {
    return (
      <div role="status" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ color: "var(--color-mint)", display: "inline-flex" }}>
          <IconCheck size={20} />
        </span>
        <p className="t-title">That address is already on the list.</p>
        <p className="t-secondary">
          We&apos;ve emailed you your place in line and your share link.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label className="ignite" data-igniting={igniting} style={{ display: "block" }}>
        <span
          style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
        >
          Email address
        </span>
        <input
          className="input"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={disabled || igniting}
        />
      </label>

      <button
        type="submit"
        className="btn btn-primary btn-full"
        disabled={disabled || igniting || email.trim().length < 3}
      >
        {igniting ? "One moment…" : ctaLabel}
      </button>

      {state.kind === "error" ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
