"use client";

import { ActionForm, type FormState } from "@/components/ActionForm";

export function ConfirmForm({
  action,
  token,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  token: string;
}) {
  return (
    <ActionForm action={action} submitLabel="Confirm (demo)" pendingLabel="Settling…" full>
      <input type="hidden" name="token" value={token} />
    </ActionForm>
  );
}
