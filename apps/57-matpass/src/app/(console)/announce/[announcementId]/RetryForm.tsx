"use client";

import { ActionForm } from "@/components/ActionForm";
import { resendAction } from "../actions";

export function RetryForm({ announcementId }: { announcementId: string }) {
  return (
    <ActionForm
      action={resendAction}
      submitLabel="Retry the ones that failed"
      variant="secondary"
      hiddenFields={{ announcementId }}
    >
      <p className="t-secondary">
        Only households without a successful outcome are tried again — nobody is mailed twice.
      </p>
    </ActionForm>
  );
}
