/**
 * app/(tabs)/calendar.tsx — Protocol calendar
 *
 * The cycle as a day-indexed timeline (DESIGN.md "Calendar"): stim days,
 * monitoring, trigger, retrieval, transfer/freeze, beta — fully editable,
 * because clinics change everything mid-cycle.
 *
 * TODO:
 * - [ ] Day-indexed list of protocol_event rows: JBM "CD n" column, glyph,
 *       title, right JBM time; past faded; today ruled 2px viridian; trigger
 *       day ruled 2px signal (the calendar's only red).
 * - [ ] Phase Label headers: STIMULATION / TRIGGER / RETRIEVAL / TRANSFER.
 * - [ ] Add/edit event sheet (radius 20): kind, date, minute-exact time for
 *       trigger, title, note; edits reschedule reminders via the engine.
 * - [ ] Mark-done on event rows; consult/instruction kinds render notes.
 * - [ ] Cycle chip row: switch cycles; history/comparison gated Plus
 *       (paywall trigger on second cycle).
 * - [ ] Ended cycles render monochrome with the archive glyph.
 * - [ ] Empty state teaches: enter the clinic calendar as given, edit as it
 *       changes ("as instructed by your clinic" — no generated schedules).
 */

export {};
