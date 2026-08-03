"use client";

import { ActionForm } from "@/components/ActionForm";
import { openLienCaseAction } from "@/app/(console)/liens/actions";
import { runTickAction } from "@/app/(console)/actions";
import type { FormState } from "@/lib/form";

export function OpenLienCaseForm({
  tenancyId,
  disabled,
  disabledReason,
}: {
  tenancyId: string;
  disabled: boolean;
  disabledReason?: string;
}) {
  return (
    <ActionForm
      action={openLienCaseAction}
      submitLabel="Open a lien case"
      variant="secondary"
      full={false}
      hold
      disabled={disabled}
      disabledReason={disabledReason}
    >
      <input type="hidden" name="tenancyId" value={tenancyId} />
    </ActionForm>
  );
}

/**
 * "Run the pass now". The nightly job is the thing that fires ladder steps, and an
 * owner who has just fixed a card should not have to wait until tomorrow to see the
 * overlock lift.
 */
export function RunPassForm() {
  const action = async (_prev: FormState): Promise<FormState> => runTickAction();
  return (
    <ActionForm
      action={action}
      submitLabel="Run the pass now"
      pendingLabel="Running…"
      variant="secondary"
      full={false}
    />
  );
}
