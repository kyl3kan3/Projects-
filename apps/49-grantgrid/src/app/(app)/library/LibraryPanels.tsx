"use client";

/**
 * The library's interactive parts: copy a block to the clipboard, edit it, add a
 * new one.
 *
 * "Copy" is the feature people actually use forty times a month, so it is a real
 * 44px target on every row and it says what happened rather than animating at you.
 */

import { useActionState, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { IconCopy, IconEdit, IconPlus } from "@/components/icons";
import { ANSWER_KIND_LABELS } from "@/lib/answers";
import type { AnswerKind } from "@/db/schema";
import { saveAnswerAction, type LibraryActionState } from "./actions";

const INITIAL: LibraryActionState = { error: null };

export function CopyBlock({ body, label }: { body: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      // A clipboard permission refusal must not look like a successful copy.
      setState("failed");
      setTimeout(() => setState("idle"), 4000);
    }
  }

  return (
    <button
      type="button"
      className="btn-quiet shrink-0"
      onClick={copy}
      aria-label={`Copy ${label}`}
    >
      <IconCopy size={18} />
      {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : "Copy"}
    </button>
  );
}

export function AnswerEditor({
  answerId,
  title,
  kind,
  body,
  trigger,
}: {
  answerId?: string;
  title?: string;
  kind?: AnswerKind;
  body?: string;
  trigger: "add" | "edit";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveAnswerAction, INITIAL);

  return (
    <>
      {trigger === "add" ? (
        <button type="button" className="btn btn-primary w-full" onClick={() => setOpen(true)}>
          <IconPlus size={18} />
          Add a block
        </button>
      ) : (
        <button
          type="button"
          className="btn-quiet shrink-0"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${title ?? "block"}`}
        >
          <IconEdit size={18} />
          Edit
        </button>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={trigger === "add" ? "Add a block" : (title ?? "Edit block")}
      >
        <form action={formAction} className="flex flex-col gap-4 pt-2">
          {answerId ? <input type="hidden" name="answerId" value={answerId} /> : null}
          <label className="flex flex-col gap-2">
            <span className="t-label">Name</span>
            <input
              className="input"
              name="title"
              defaultValue={title ?? ""}
              placeholder="Program: after-school tutoring"
              required
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Kind</span>
            <select className="select" name="kind" defaultValue={kind ?? "custom"}>
              {Object.entries(ANSWER_KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Content</span>
            <textarea
              className="textarea"
              name="body"
              rows={14}
              defaultValue={body ?? ""}
              placeholder="The text you will paste into funder portals."
            />
          </label>
          {state.error ? (
            <p className="t-secondary" role="alert" style={{ color: "var(--color-brick-text)" }}>
              {state.error}
            </p>
          ) : null}
          {state.ok ? (
            <p className="t-secondary" style={{ color: "var(--color-leaf-text)" }}>
              Saved.
            </p>
          ) : null}
          <button className="btn btn-primary w-full" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save block"}
          </button>
          <p className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
            Changing the text bumps the version. Drafts already snapshotted into a grant
            keep the wording they were sent with.
          </p>
        </form>
      </Sheet>
    </>
  );
}
