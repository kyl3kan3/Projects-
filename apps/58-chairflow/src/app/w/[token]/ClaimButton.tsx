"use client";

import { useActionState } from "react";
import { claimAction, type ClaimValues } from "@/app/w/[token]/actions";
import { FormError } from "@/components/ui";
import { emptyState, type FormState } from "@/lib/forms";

export function ClaimButton({ token }: { token: string }) {
  const initial: FormState<ClaimValues> = emptyState({ token });
  const [state, action, pending] = useActionState(claimAction, initial);
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} />
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Claiming…" : "Claim this slot"}
      </button>
    </form>
  );
}
