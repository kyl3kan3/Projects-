"use client";

import { useActionState, useState } from "react";
import { uploadCertificateAction, type UploadState } from "./actions";
import { DeficiencyList } from "@/components/DeficiencyList";
import { ComplianceSeal } from "@/components/ComplianceSeal";
import { IconUpload } from "@/components/icons";

/**
 * The vendor's whole surface: one file field and one button, mobile-first at 390px.
 * The primary action sits in the thumb zone, and every state is a sentence in plain
 * language — the reader is an insurance agent's assistant, not a compliance officer.
 */
/** Declared here, not in actions.ts: a `"use server"` module can only export
 *  async functions, so a constant exported from one is `undefined` at runtime. */
const UPLOAD_INITIAL: UploadState = {
  error: null,
  status: "idle",
  message: null,
  deficiencies: [],
};

export function UploadForm({ token, orgName }: { token: string; orgName: string }) {
  const [state, action, pending] = useActionState(uploadCertificateAction, UPLOAD_INITIAL);
  const [filename, setFilename] = useState<string | null>(null);

  const done = state.status !== "idle";

  return (
    <>
      {/* The pipeline, stated honestly rather than as a spinner. */}
      <ol
        className="t-secondary"
        style={{ marginTop: 24, paddingLeft: 0, listStyle: "none", display: "grid", gap: 8 }}
      >
        {[
          { key: "received", label: "You upload the PDF" },
          { key: "read", label: "We read the coverage off the form" },
          { key: "checked", label: `We check it against ${orgName}'s requirement` },
        ].map((step, i) => (
          <li key={step.key} className="flex items-baseline" style={{ gap: 10 }}>
            <span className="t-mono" style={{ color: "var(--color-faint)" }}>
              {i + 1}
            </span>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>

      {!done && (
        <form action={action} style={{ marginTop: 24 }}>
          <input type="hidden" name="token" value={token} />
          <div className="field">
            <label className="field-label" htmlFor="file">
              Certificate of insurance (PDF)
            </label>
            <input
              id="file"
              name="file"
              type="file"
              accept="application/pdf,.pdf"
              className="input"
              required
              onChange={(e) => setFilename(e.target.files?.[0]?.name ?? null)}
            />
            <p className="field-help">
              The ACORD 25 your carrier issued. A photo or a scan will still be accepted and kept, but
              someone will have to type it in, which is slower for everyone.
            </p>
            {filename && (
              <p className="t-mono" style={{ marginTop: 8, color: "var(--color-dim)" }}>
                {filename}
              </p>
            )}
          </div>

          {state.error && (
            <p className="field-error" role="alert" style={{ marginBottom: 16 }}>
              {state.error}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
            <IconUpload size={18} />
            {pending ? "Uploading…" : "Upload the certificate"}
          </button>
          <p className="field-help">No account, no password. This link is just for you.</p>
        </form>
      )}

      {done && (
        <section style={{ marginTop: 24 }}>
          <div className="flex items-center" style={{ gap: 8 }}>
            {state.status === "accepted" && <ComplianceSeal earned press size={24} />}
            <h2 className="t-h2">
              {state.status === "accepted"
                ? "On file and compliant"
                : state.status === "deficient"
                  ? "On file — but not yet compliant"
                  : state.status === "under_review"
                    ? "On file — under review"
                    : state.status === "unreadable"
                      ? "On file — we will type it in"
                      : "Received"}
            </h2>
          </div>
          <p className="t-body" style={{ marginTop: 12 }}>
            {state.message}
          </p>
          <DeficiencyList deficiencies={state.deficiencies} className="mt-4" />

          {(state.status === "deficient" || state.status === "received") && (
            <a href={`/v/${token}`} className="btn btn-secondary btn-full" style={{ marginTop: 24 }}>
              Upload another certificate
            </a>
          )}
        </section>
      )}
    </>
  );
}
