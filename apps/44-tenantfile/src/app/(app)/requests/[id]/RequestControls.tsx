"use client";

import { ActionForm } from "@/components/ActionForm";
import { postMessageAction, updateRequestAction } from "@/app/(app)/actions";
import { IconCamera } from "@/components/icons";
import type { RequestPriority, RequestStatus } from "@/db/schema";

export function RequestControls({
  requestId,
  status,
  priority,
  scheduledFor,
  costCents,
}: {
  requestId: string;
  status: RequestStatus;
  priority: RequestPriority;
  scheduledFor: string;
  costCents: number | null;
  tenancyId: string;
}) {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="t-label mb-3">Reply</h2>
        <ActionForm action={postMessageAction} submitLabel="Send">
          <input type="hidden" name="requestId" value={requestId} />
          <label className="field">
            <span className="sr-only">Your message</span>
            <textarea
              className="input"
              name="body"
              rows={3}
              placeholder="I can be there Thursday morning with a new cartridge for the tap."
            />
          </label>
          <label className="field">
            <span className="t-label flex items-center gap-2">
              <IconCamera size={18} />
              Photos
            </span>
            <input
              className="input"
              style={{ paddingTop: 12, minHeight: 48 }}
              type="file"
              name="photos"
              accept="image/jpeg,image/png,image/webp"
              multiple
            />
          </label>
          <p className="t-secondary">The tenant gets a text if you have their number, otherwise an email.</p>
        </ActionForm>
      </section>

      <section>
        <h2 className="t-label mb-3">Where it stands</h2>
        <ActionForm action={updateRequestAction} submitLabel="Save" variant="secondary">
          <input type="hidden" name="requestId" value={requestId} />

          <div className="flex gap-3">
            <label className="field flex-1">
              <span className="t-label">Status</span>
              <select className="input" name="status" defaultValue={status}>
                <option value="open">Open</option>
                <option value="scheduled">Scheduled</option>
                <option value="done">Done</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <label className="field flex-1">
              <span className="t-label">Priority</span>
              <select className="input" name="priority" defaultValue={priority}>
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="emergency">Emergency</option>
              </select>
            </label>
          </div>

          <div className="flex gap-3">
            <label className="field flex-1">
              <span className="t-label">Visit date</span>
              <input className="input input-mono" name="scheduledFor" type="date" defaultValue={scheduledFor} />
            </label>
            <label className="field flex-1">
              <span className="t-label">What it cost</span>
              <input
                className="input input-mono"
                name="cost"
                inputMode="decimal"
                defaultValue={costCents != null ? (costCents / 100).toFixed(2) : ""}
                placeholder="145.00"
              />
            </label>
          </div>

          <p className="t-secondary">
            The cost is per unit, so a boiler that keeps failing shows up as a number rather than a feeling. Closing the
            request stitches it into the tenancy&apos;s file.
          </p>
        </ActionForm>
      </section>
    </div>
  );
}
