"use client";

/**
 * The detected contract type, confirmable.
 *
 * The type is not cosmetic: missing-clause detection is driven by the per-type checklist,
 * so an NDA mistaken for an MSA would be flagged for having no payment terms. Correcting
 * it therefore re-scores the contract rather than just relabelling it — the page's
 * processing view picks the pipeline back up from the scoring stage.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmContractTypeAction } from "../actions";
import type { ContractType } from "@/db/schema";

const OPTIONS: Array<{ value: ContractType; label: string }> = [
  { value: "msa", label: "Master Services Agreement" },
  { value: "sow", label: "Statement of Work" },
  { value: "nda", label: "NDA" },
  { value: "vendor", label: "Vendor Agreement" },
  { value: "lease", label: "Commercial Lease" },
  { value: "other", label: "Something else" },
];

export function ContractTypeConfirm({
  contractId,
  contractType,
  confirmed,
}: {
  contractId: string;
  contractType: ContractType;
  confirmed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const apply = async (value: ContractType) => {
    setBusy(true);
    await confirmContractTypeAction(contractId, value);
    setOpen(false);
    setBusy(false);
    router.refresh();
  };

  if (confirmed) return null;

  return (
    <div className="mt-3 no-print">
      {open ? (
        <div className="card p-4">
          <p className="t-secondary">
            The type decides which clauses are expected. Pick the right one and the contract
            is scored again.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => apply(option.value)}
                style={{ justifyContent: "flex-start" }}
              >
                {option.label}
                {option.value === contractType ? " · detected" : ""}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button type="button" className="btn-quiet btn-quiet-sm" onClick={() => setOpen(true)}>
          Not the right kind of contract?
        </button>
      )}
    </div>
  );
}
