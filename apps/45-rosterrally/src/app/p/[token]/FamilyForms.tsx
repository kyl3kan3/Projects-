"use client";

import { ActionForm, type FormState } from "@/components/ActionForm";
import { formatMoney } from "@/lib/money";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export function ClaimForm({
  action,
  token,
  slotId,
  role,
  spotsLeft,
}: {
  action: Action;
  token: string;
  slotId: string;
  role: string;
  spotsLeft: number;
}) {
  return (
    <ActionForm
      action={action}
      submitLabel={`Claim ${role}`}
      pendingLabel="Claiming…"
      variant="secondary"
      small
      disabled={spotsLeft <= 0}
      disabledReason="That one is full now."
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="slotId" value={slotId} />
    </ActionForm>
  );
}

export function ReleaseForm({
  action,
  token,
  claimId,
}: {
  action: Action;
  token: string;
  claimId: string;
}) {
  return (
    <ActionForm action={action} submitLabel="Give it up" variant="quiet" confirmHold>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="claimId" value={claimId} />
    </ActionForm>
  );
}

export function PayForm({
  action,
  token,
  netDueCents,
}: {
  action: Action;
  token: string;
  netDueCents: number;
}) {
  return (
    <ActionForm
      action={action}
      submitLabel={`Pay ${formatMoney(netDueCents)}`}
      pendingLabel="Opening checkout…"
      full
      disabled={netDueCents <= 0}
      disabledReason="Nothing is outstanding."
    >
      <input type="hidden" name="token" value={token} />
    </ActionForm>
  );
}
