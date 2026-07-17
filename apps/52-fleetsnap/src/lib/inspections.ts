/**
 * src/lib/inspections.ts
 *
 * Inspection submission and defect promotion (ARCHITECTURE.md flows 1-2).
 * Inspections are immutable after submission; drafts sync exactly once
 * via the client-generated draft id.
 *
 * TODO:
 * - [ ] submitInspection(input): validate against the template; enforce
 *       photo-on-fail SERVER-SIDE (a failed item without a confirmed
 *       photo rejects with the item named); write inspections +
 *       inspection_items transactionally; upsert by client_draft_id so
 *       an offline retry is a no-op (exactly-once).
 * - [ ] Odometer sanity: reject entries wildly below the vehicle's last
 *       reading (configurable tolerance) with an inline-correctable
 *       error; accepted values update vehicles.current_odometer.
 * - [ ] promoteDefects(inspectionId): failed items -> defects rows
 *       (unique per item); severity from the template's critical flag;
 *       critical -> vehicle out_of_service + notify enqueue; every defect
 *       auto-opens a work order (source: defect) carrying photos.
 * - [ ] complianceRate(fleetId, range): inspected-vs-expected per vehicle
 *       day -- the weekly digest's number.
 */

export interface InspectionItemInput {
  groupKey: string;
  itemKey: string;
  result: "pass" | "fail" | "na";
  note?: string;
  photoKeys?: string[];
}

export interface SubmitInspectionInput {
  clientDraftId: string;
  vehicleId: string;
  driverId: string;
  templateId: string;
  kind: "pre_trip" | "post_trip";
  odometer: number;
  startedAt: Date;
  durationSeconds: number;
  signatureName: string;
  items: InspectionItemInput[];
}

/** Persist a submitted inspection exactly once; returns the inspection id. */
export async function submitInspection(
  _input: SubmitInspectionInput,
): Promise<string> {
  throw new Error("Not implemented");
}

/** Promote failed items to defects, apply OOS rules, open work orders. */
export async function promoteDefects(_inspectionId: string): Promise<void> {
  throw new Error("Not implemented");
}
