/**
 * src/lib/call-queue.ts
 *
 * The front desk's daily list: ranked, dollar-weighted, two-tap
 * dispositioned. Rebuilt fresh every morning — no guilt backlog.
 *
 * TODO:
 * - [ ] buildQueue(locationId, date): rank uncontacted-lately overdue
 *       patients by value x bucket urgency x days-since-last-touch;
 *       exclude active mid-sequence enrollments and do_not_contact;
 *       materialize top N (default 20) as call_tasks; expire yesterday's
 *       unworked rows. Idempotent per (location, date).
 * - [ ] Booking requests from links pin to the top of the queue screen.
 * - [ ] disposition(): two-tap outcomes (booked / left_message / call_back /
 *       skip / do_not_contact) + note; writes the call touch (feeds
 *       attribution); booked -> create booking + stop enrollments;
 *       do_not_contact -> permanent flag + audit row.
 * - [ ] queueProgress(): "4 of 20 worked" for the screen header.
 */

export async function buildQueue(
  _locationId: string,
  _queueDate: string,
): Promise<{ tasksCreated: number }> {
  // TODO: implement per ARCHITECTURE.md key flow 5
  throw new Error("Not implemented");
}

export async function disposition(_input: {
  callTaskId: string;
  userId: string;
  outcome: "booked" | "left_message" | "call_back" | "skip" | "do_not_contact";
  note?: string;
  appointmentOn?: Date;
}): Promise<void> {
  throw new Error("Not implemented");
}
