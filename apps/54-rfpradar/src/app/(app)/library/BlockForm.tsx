"use client";

/**
 * The block editor. One form, used for both new and existing blocks.
 *
 * The version note under the save button is the whole trust story: editing here
 * never changes a pursuit that already linked this block. Saying so at the moment
 * of editing is worth more than a paragraph in a help centre.
 */

import { useActionState } from "react";
import type { AnswerBlock } from "@/db/schema";
import { blockKindLabel } from "@/lib/format";
import { saveBlockAction, type BlockFormState } from "./actions";

const KINDS: AnswerBlock["kind"][] = [
  "boilerplate",
  "past_answer",
  "bio",
  "past_performance",
  "attachment_ref",
];

const PLACEHOLDERS: Record<string, string> = {
  boilerplate:
    "Northgate IT Services is a 22-person managed services firm founded in 2011, headquartered in Richmond, Virginia…",
  past_answer:
    "Our incident response process follows NIST SP 800-61r2. On confirmation of a critical alert, the on-call analyst…",
  bio: "M. Torres, Security Operations Lead. CISSP, 14 years in public-sector SOC operations. Led the migration of…",
  past_performance:
    "Commonwealth of Virginia, Department of Social Services (2023–2025). 12,000 endpoints monitored 24x7…",
  attachment_ref:
    "SF-1449 signed original, W-9, SWaM certificate #1234567 — stored in the shared drive under /proposals/forms.",
};

export function BlockForm({ block }: { block?: AnswerBlock }) {
  const [state, action, pending] = useActionState<BlockFormState, FormData>(saveBlockAction, {
    error: null,
    notice: null,
  });

  return (
    <form action={action} className="flex flex-col gap-4">
      {block && <input type="hidden" name="id" value={block.id} />}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="t-label">Kind</span>
          <select className="select" name="kind" defaultValue={block?.kind ?? "boilerplate"}>
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {blockKindLabel(kind)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-label">Tags</span>
          <input
            className="input"
            name="tags"
            defaultValue={block?.tags.join(", ") ?? ""}
            placeholder="soc, incident-response, virginia"
          />
        </label>
      </div>

      <label className="flex flex-col gap-2">
        <span className="t-label">Title</span>
        <input
          className="input"
          name="title"
          required
          defaultValue={block?.title ?? ""}
          placeholder="Incident response process — 24x7 SOC"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Text</span>
        <textarea
          className="textarea"
          name="body"
          rows={10}
          required
          defaultValue={block?.body ?? ""}
          placeholder={PLACEHOLDERS[block?.kind ?? "boilerplate"]}
        />
      </label>

      {state.error && (
        <p role="alert" className="t-secondary" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="t-secondary" style={{ color: "var(--color-green-text)" }}>
          {state.notice}
        </p>
      )}

      <button className="btn btn-primary w-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : block ? `Save as v${block.version + 1}` : "Add block"}
      </button>
      <p className="t-secondary">
        {block
          ? "Saving bumps the version. Pursuits that already linked this block keep the text they froze — submitted work is history."
          : "New blocks are marked reviewed today, so the staleness clock starts now."}
      </p>
    </form>
  );
}
