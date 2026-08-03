"use client";

import { createTalkAction } from "../../actions";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";

export function NewTalkForm() {
  return (
    <ActionForm action={createTalkAction} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="t-label">Title</span>
        <input
          className="input"
          name="title"
          placeholder="Scissor lifts on the Harbor Point deck"
          required
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="t-label">Hazard tags, comma separated</span>
        <input className="input" name="hazardTags" placeholder="aerial lifts, falls" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="t-label">The talk</span>
        <textarea
          className="input"
          name="bodyMd"
          rows={14}
          required
          placeholder={"## Why this one matters\nThe deck edge is unprotected until the guardrail goes up Thursday.\n\n## What we do today\n- Tie off to the ridge anchor, every time\n- Nobody works the edge alone"}
        />
      </label>
      <SubmitButton pendingLabel="Saving…">Save to the library</SubmitButton>
    </ActionForm>
  );
}
