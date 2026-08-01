"use client";

import { useActionState, useState } from "react";
import { HostedPageView, type HostedPageContent } from "@/components/HostedPageView";
import { updateContentAction, type FormState } from "../../actions";
import { ACCENT_CHOICES, GROUND_CHOICES, TEMPLATES, TEMPLATE_IDS, TYPE_PAIRS } from "@/lib/templates";
import type { TemplateId } from "@/db/schema";

/**
 * The page builder: a live preview in a `panel` frame up top, token controls in a
 * bottom sheet. Every change animates the preview within 200ms, because the
 * preview *is* the page component — there is no second renderer to drift.
 */
export function BuilderClient({
  listId,
  initial,
  joinedCount,
}: {
  listId: string;
  initial: HostedPageContent;
  joinedCount: number;
}) {
  const action = updateContentAction.bind(null, listId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const [draft, setDraft] = useState<HostedPageContent>(initial);
  const [tab, setTab] = useState<"content" | "style">("content");

  const set = <K extends keyof HostedPageContent>(key: K, value: HostedPageContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <>
      {/* Preview frame: radius 14, panel ground, the real page inside it. */}
      <div
        className="panel"
        style={{ overflow: "hidden", height: 420, padding: 0, transition: "background 200ms linear" }}
      >
        <div
          style={{
            height: "100%",
            overflowY: "auto",
            transition: "background 200ms linear",
            background: draft.theme.ground,
          }}
        >
          <HostedPageView content={draft} joinedCount={joinedCount} preview />
        </div>
      </div>
      <p className="t-secondary" style={{ marginTop: 8 }}>
        Live preview. The form is inert here — it takes signups on the real page.
      </p>

      <form action={formAction} style={{ marginTop: 24 }}>
        {/* The sheet: grab handle, radius 20 top corners. */}
        <div className="sheet" style={{ padding: 16, paddingTop: 12 }}>
          <div className="sheet-grab" />

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              type="button"
              className="chip"
              data-active={tab === "content"}
              onClick={() => setTab("content")}
            >
              Content
            </button>
            <button
              type="button"
              className="chip"
              data-active={tab === "style"}
              onClick={() => setTab("style")}
            >
              Style
            </button>
          </div>

          {/* Both panes stay mounted so their inputs always submit. */}
          <div style={{ display: tab === "content" ? "block" : "none", marginTop: 20 }}>
            <Field label="Product name">
              <input
                className="input"
                name="name"
                value={draft.name}
                maxLength={60}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Headline">
              <input
                className="input"
                name="headline"
                value={draft.headline}
                maxLength={140}
                onChange={(e) => set("headline", e.target.value)}
              />
            </Field>
            <Field label="Subhead">
              <textarea
                className="input"
                name="subhead"
                value={draft.subhead}
                maxLength={400}
                style={{ minHeight: 96 }}
                onChange={(e) => set("subhead", e.target.value)}
              />
            </Field>
            <Field label="Button">
              <input
                className="input"
                name="ctaLabel"
                value={draft.ctaLabel}
                maxLength={40}
                onChange={(e) => set("ctaLabel", e.target.value)}
              />
            </Field>
            <Field label="Fine print under the form">
              <input
                className="input"
                name="proofLine"
                value={draft.proofLine}
                maxLength={160}
                onChange={(e) => set("proofLine", e.target.value)}
              />
            </Field>
          </div>

          <div style={{ display: tab === "style" ? "block" : "none", marginTop: 20 }}>
            <input type="hidden" name="template" value={draft.template} />
            <input type="hidden" name="ground" value={draft.theme.ground} />
            <input type="hidden" name="accent" value={draft.theme.accent} />
            <input type="hidden" name="typePair" value={draft.theme.typePair} />

            <p className="t-label">Layout</p>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {TEMPLATE_IDS.map((id) => (
                <button
                  type="button"
                  key={id}
                  className="chip"
                  data-active={draft.template === id}
                  onClick={() => set("template", id as TemplateId)}
                >
                  {TEMPLATES[id].name}
                </button>
              ))}
            </div>

            <p className="t-label" style={{ marginTop: 24 }}>
              Ground
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {GROUND_CHOICES.map((choice) => (
                <button
                  type="button"
                  key={choice.value}
                  className="chip"
                  data-active={draft.theme.ground === choice.value}
                  onClick={() => set("theme", { ...draft.theme, ground: choice.value })}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      background: choice.value,
                      border: "1px solid var(--color-hairline)",
                    }}
                  />
                  {choice.label}
                </button>
              ))}
            </div>

            <p className="t-label" style={{ marginTop: 24 }}>
              Accent
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {ACCENT_CHOICES.map((choice) => (
                <button
                  type="button"
                  key={choice.value}
                  className="chip"
                  data-active={draft.theme.accent === choice.value}
                  onClick={() => set("theme", { ...draft.theme, accent: choice.value })}
                >
                  <span
                    style={{ width: 14, height: 14, borderRadius: 4, background: choice.value }}
                  />
                  {choice.label}
                </button>
              ))}
            </div>
            <p className="t-secondary" style={{ marginTop: 12 }}>
              The accent recolors links, the invite line and the reward progress. The button stays
              off-white with ink text on every theme — that construction is fixed.
            </p>

            <p className="t-label" style={{ marginTop: 24 }}>
              Headline face
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {TYPE_PAIRS.map((pair) => (
                <button
                  type="button"
                  key={pair.value}
                  className="chip"
                  data-active={draft.theme.typePair === pair.value}
                  onClick={() => set("theme", { ...draft.theme, typePair: pair.value })}
                >
                  {pair.label}
                </button>
              ))}
            </div>
          </div>

          {state.error ? (
            <p className="t-secondary" role="alert" style={{ marginTop: 16, color: "var(--color-red)" }}>
              {state.error}
            </p>
          ) : null}
          {state.ok ? (
            <p className="t-secondary" role="status" style={{ marginTop: 16, color: "var(--color-mint)" }}>
              {state.ok}
            </p>
          ) : null}
        </div>

        <div style={{ marginTop: 16 }}>
          <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
            {pending ? "Saving…" : "Save the page"}
          </button>
        </div>
      </form>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
      <span className="t-label">{label}</span>
      {children}
    </label>
  );
}
