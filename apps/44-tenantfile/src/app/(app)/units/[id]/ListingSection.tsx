"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { closeListingAction, createListingAction } from "@/app/(app)/actions";
import type { Listing } from "@/db/schema";
import { formatMoney } from "@/lib/money";

export function ListingSection({
  unitId,
  listing,
  rentCents,
  depositCents,
}: {
  unitId: string;
  listing: Listing | null;
  rentCents: number;
  depositCents: number;
}) {
  const [open, setOpen] = useState(!listing);

  if (listing) {
    return (
      <section className="mb-8">
        <h2 className="t-label mb-3">Listing</h2>
        <div className="card p-4">
          <p className="t-title">{listing.headline}</p>
          <p className="t-secondary mt-2">
            {listing.photoKeys.length} photo{listing.photoKeys.length === 1 ? "" : "s"} · available{" "}
            {listing.requirements.availableOn} · {listing.requirements.leaseMonths}-month lease · deposit{" "}
            {formatMoney(listing.requirements.depositCents)} · income at least {listing.requirements.minIncomeMultiple}×
            rent
          </p>
          <div className="mt-4">
            <ActionForm
              action={closeListingAction}
              submitLabel="Close the listing"
              variant="secondary"
              full={false}
              hold
              className="flex flex-col gap-3"
            >
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="unitId" value={unitId} />
            </ActionForm>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="t-label">Listing</h2>
        {!open ? (
          <button type="button" className="btn-quiet" onClick={() => setOpen(true)}>
            List this unit
          </button>
        ) : null}
      </div>

      {!open ? (
        <p className="t-secondary">This unit is not listed. Put a listing up and you get a link anyone can apply from.</p>
      ) : (
        <ActionForm action={createListingAction} submitLabel="Publish the listing" pendingLabel="Publishing…">
          <input type="hidden" name="unitId" value={unitId} />

          <label className="field">
            <span className="t-label">Headline</span>
            <input
              className="input"
              name="headline"
              required
              maxLength={120}
              placeholder="Bright 2-bed upstairs unit, porch, off-street parking"
            />
          </label>

          <label className="field">
            <span className="t-label">Description</span>
            <textarea
              className="input"
              name="description"
              rows={6}
              placeholder="Second floor of a well-kept 1920s duplex. New windows last spring, gas heat, washer-dryer in the basement shared with one other unit. Quiet street, ten minutes from downtown. Tenant pays gas and electric; I cover water and trash."
            />
          </label>

          <label className="field">
            <span className="t-label">Photos</span>
            <input className="input" style={{ paddingTop: 12 }} type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple />
            <span className="t-secondary">JPEG, PNG or WebP, up to 8MB each. Photos are the whole listing — take six.</span>
          </label>

          <div className="flex gap-3">
            <label className="field flex-1">
              <span className="t-label">Available from</span>
              <input className="input input-mono" name="availableOn" type="date" required />
            </label>
            <label className="field w-[130px]">
              <span className="t-label">Lease months</span>
              <input className="input input-mono" name="leaseMonths" type="number" min={1} max={36} defaultValue={12} />
            </label>
          </div>

          <div className="flex gap-3">
            <label className="field flex-1">
              <span className="t-label">Deposit</span>
              <input
                className="input input-mono"
                name="deposit"
                inputMode="decimal"
                defaultValue={(depositCents / 100).toFixed(0)}
              />
            </label>
            <label className="field flex-1">
              <span className="t-label">Income ≥ × rent</span>
              <input
                className="input input-mono"
                name="minIncomeMultiple"
                type="number"
                step="0.1"
                min={0}
                max={10}
                defaultValue={3}
              />
            </label>
          </div>
          <p className="t-secondary">
            Rent shows as {formatMoney(rentCents)} from the unit itself, so the listing and the ledger can never disagree.
          </p>

          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3">
              <input type="checkbox" name="petsAllowed" />
              <span className="t-body">Pets considered</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" name="smokingAllowed" />
              <span className="t-body">Smoking allowed</span>
            </label>
          </div>
        </ActionForm>
      )}
    </section>
  );
}
