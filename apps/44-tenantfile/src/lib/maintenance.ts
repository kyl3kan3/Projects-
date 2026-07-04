/**
 * src/lib/maintenance.ts
 *
 * Maintenance requests with photo threads: the text-message workflow,
 * formalized. Tenant opens a request from the pay page; both sides talk
 * in a thread; every request feeds the File.
 *
 * TODO:
 * - [ ] openRequest(tenancyId, title, body, photoKeys, openedBy): create
 *       request + first message, notify landlord (SMS-first for tenants).
 * - [ ] postMessage(requestId, author, body, photoKeys): thread append +
 *       cross-notification; photo count/size limits enforced here.
 * - [ ] Status transitions: open -> scheduled -> done -> closed; cost
 *       tracking on done; per-unit maintenance history rollup.
 * - [ ] Closing a request stitches a file_event with the full thread ref.
 * - [ ] Anti-abuse: rate limits on tenant posts, photo type validation.
 */

export type RequestStatus = "open" | "scheduled" | "done" | "closed";

export function openRequest(
  _tenancyId: string,
  _title: string,
  _body: string,
  _photoKeys: string[],
  _openedBy: "tenant" | "landlord",
): Promise<void> {
  throw new Error("Not implemented");
}
