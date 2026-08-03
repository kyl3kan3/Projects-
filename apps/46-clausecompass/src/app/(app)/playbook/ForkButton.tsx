"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createHouseRulesAction } from "./actions";

/** Copies the built-in playbook into an editable one for this account. */
export function ForkButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const result = await createHouseRulesAction();
          setError(result.error);
          setBusy(false);
          if (!result.error) router.refresh();
        }}
      >
        {busy ? "Copying…" : "Create my house rules"}
      </button>
      {error && (
        <p className="t-secondary mt-2" style={{ color: "var(--color-oxblood)" }} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
