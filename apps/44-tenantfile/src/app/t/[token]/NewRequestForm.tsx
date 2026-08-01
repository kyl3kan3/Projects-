"use client";

import { useActionState, useState } from "react";
import { tenantOpenRequestAction, type PortalState } from "./actions";
import { IconCamera } from "@/components/icons";

export function NewRequestForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<PortalState, FormData>(tenantOpenRequestAction, {});
  const [open, setOpen] = useState(false);

  if (state.ok) {
    return (
      <section className="mb-8">
        <div className="notice" data-tone="good">
          <p className="t-title">Reported.</p>
          <p className="t-secondary mt-2">{state.message}</p>
        </div>
      </section>
    );
  }

  if (!open) {
    return (
      <section className="mb-8">
        <button type="button" className="btn-quiet" onClick={() => setOpen(true)}>
          Something needs fixing
        </button>
        <p className="t-secondary mt-2">
          Send it with photos and it goes straight to your landlord, with the time and date on it.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <h2 className="t-h2 mb-4">Something needs fixing</h2>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />

        <label className="field">
          <span className="t-label">What is it</span>
          <input className="input" name="title" required maxLength={80} placeholder="Kitchen tap dripping" />
        </label>

        <label className="field">
          <span className="t-label">What is happening</span>
          <textarea
            className="input"
            name="body"
            rows={4}
            required
            placeholder="The cold tap has been dripping since Sunday and it is getting faster. I have put a bowl under it. The cupboard below is dry so far."
          />
        </label>

        <label className="field">
          <span className="t-label">How urgent</span>
          <select className="input" name="priority" defaultValue="routine">
            <option value="routine">It can wait</option>
            <option value="urgent">Soon, please</option>
            <option value="emergency">Emergency — water, heat, electricity or safety</option>
          </select>
        </label>

        <label className="field">
          <span className="t-label flex items-center gap-2">
            <IconCamera size={18} />
            Photos
          </span>
          <input
            className="input"
            style={{ paddingTop: 12, minHeight: 48 }}
            type="file"
            name="photos"
            accept="image/jpeg,image/png,image/webp"
            multiple
            capture="environment"
          />
          <span className="t-secondary">Up to six. A photo saves everyone a phone call.</span>
        </label>

        {state.error ? (
          <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
            {state.error}
          </p>
        ) : null}

        <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send it"}
        </button>
        <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
          Never mind
        </button>
      </form>
    </section>
  );
}
