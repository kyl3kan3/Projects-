"use client";

/**
 * The changelog editor. Draft entries carry the auto-drafted body, editable
 * inline, and Publish is the primary action. The preview uses the same
 * `.doc` styles as the public page, so what you approve is what ships.
 */

import { useActionState, useState } from "react";
import { publishEntryAction, saveEntryAction, unpublishEntryAction } from "./actions";
import { EMPTY_STATE } from "@/lib/form-state";
import { Markdown } from "@/lib/markdown";
import { LevelLabel } from "@/components/Verdict";

export interface EntryView {
  id: string;
  status: "draft" | "published";
  title: string;
  bodyMd: string;
  breaking: boolean;
  versionLabel: string;
  anchor: string;
  dateLabel: string;
  diffId: string | null;
  needsMigrationNote: boolean;
}

export function EntryEditor({ slug, entry }: { slug: string; entry: EntryView }) {
  const [saveState, saveAction, savePending] = useActionState(saveEntryAction, EMPTY_STATE);
  const [publishState, publishAction, publishPending] = useActionState(publishEntryAction, EMPTY_STATE);
  const [unpublishState, unpublishAction, unpublishPending] = useActionState(unpublishEntryAction, EMPTY_STATE);
  const [title, setTitle] = useState(entry.title);
  const [body, setBody] = useState(entry.bodyMd);
  const [preview, setPreview] = useState(false);

  const stillPlaceholder = body.includes("_Migration note needed");
  const state = saveState.error || saveState.ok ? saveState : publishState.error || publishState.ok ? publishState : unpublishState;

  return (
    <article className="card" style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="t-data" style={{ color: "var(--color-text-2)" }}>
          {entry.versionLabel}
        </span>
        <span className="t-label" style={{ color: "var(--color-text-3-aa)" }}>
          {entry.dateLabel}
        </span>
        {entry.breaking ? <LevelLabel level="breaking" /> : null}
        <span
          className="t-label"
          style={{ color: entry.status === "published" ? "var(--color-green)" : "var(--color-amber)" }}
        >
          {entry.status}
        </span>
      </div>

      {preview ? (
        <div>
          <h3 className="t-h2" style={{ fontSize: 20, margin: "0 0 12px" }}>
            {title}
          </h3>
          <div className={`doc ${entry.breaking ? "entry-breaking" : ""}`}>
            <Markdown source={body} />
          </div>
        </div>
      ) : (
        <>
          <label className="field">
            <span className="t-label">Title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} minLength={4} />
          </label>
          <label className="field">
            <span className="t-label">Body (Markdown)</span>
            <textarea
              className="textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
            />
            <span className="field-hint">
              Auto-drafted from the diff. Every claim traces to a rule and a JSON pointer — edit the wording, not
              the facts.
            </span>
          </label>
        </>
      )}

      {stillPlaceholder ? (
        <p className="t-secondary" style={{ color: "var(--color-amber)", margin: 0 }}>
          This draft still has an unfilled migration note. Publishing is blocked until you write what consumers
          should do instead.
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", margin: 0 }}>
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="t-secondary" style={{ color: "var(--color-green)", margin: 0 }}>
          {state.ok}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn-quiet" onClick={() => setPreview((v) => !v)}>
          {preview ? "Edit" : "Preview as a consumer"}
        </button>
        {entry.diffId ? (
          <a href={`/apis/${slug}/diffs/${entry.diffId}`} className="btn-quiet">
            The diff behind this
          </a>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {entry.status === "draft" ? (
          <>
            <form action={publishAction}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="entryId" value={entry.id} />
              <input type="hidden" name="title" value={title} />
              <input type="hidden" name="bodyMd" value={body} />
              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={publishPending || stillPlaceholder}
              >
                {publishPending ? "Publishing…" : "Publish"}
              </button>
            </form>
            <form action={saveAction}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="entryId" value={entry.id} />
              <input type="hidden" name="title" value={title} />
              <input type="hidden" name="bodyMd" value={body} />
              <button type="submit" className="btn btn-secondary btn-full" disabled={savePending}>
                {savePending ? "Saving…" : "Save draft"}
              </button>
            </form>
          </>
        ) : (
          <>
            <form action={saveAction}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="entryId" value={entry.id} />
              <input type="hidden" name="title" value={title} />
              <input type="hidden" name="bodyMd" value={body} />
              <button type="submit" className="btn btn-secondary btn-full" disabled={savePending}>
                {savePending ? "Saving…" : "Save changes"}
              </button>
            </form>
            <form action={unpublishAction}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="entryId" value={entry.id} />
              <button type="submit" className="btn-quiet" disabled={unpublishPending}>
                {unpublishPending ? "Working…" : "Move back to draft"}
              </button>
            </form>
          </>
        )}
      </div>
    </article>
  );
}
