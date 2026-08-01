"use client";

import { ActionForm, type FormState } from "@/components/ActionForm";

/** "Re-send to 12 unreached" — a quiet action, per DESIGN.md's receipt grid. */
export function ResendForm({
  action,
  announcementId,
  count,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  announcementId: string;
  count: number;
}) {
  return (
    <ActionForm
      action={action}
      submitLabel={`Re-send to ${count} unreached`}
      pendingLabel="Re-sending…"
      variant="quiet"
    >
      <input type="hidden" name="announcementId" value={announcementId} />
    </ActionForm>
  );
}
