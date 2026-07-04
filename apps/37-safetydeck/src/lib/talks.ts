/**
 * src/lib/talks.ts
 *
 * Toolbox-talk library and scheduling: the 52-talk seed set, rotation,
 * the Monday fan-out, and instance lifecycle.
 *
 * TODO:
 * - [ ] Seed content plan: 52+ talks (fall protection, ladders, trenching,
 *       heat illness, silica, lockout/tagout, PPE, hand tools, ...) as
 *       markdown with hazard tags, ~5-minute read length, plain language.
 *       English v1; Spanish variants keyed to the same talk ids (Phase 2).
 * - [ ] scheduleWeek(companyId, weekOf): create talk_instances per active
 *       crew from the rotation (ops can override the topic per week);
 *       idempotent per (crew, weekOf).
 * - [ ] fanOut(instanceId): mint crew token, send the foreman the link by
 *       SMS (Twilio) with email fallback; stamp status = delivered.
 * - [ ] missedSweep(now): instances still delivered/in_progress at end of
 *       talk day + grace -> status missed + reminder ladder entry.
 * - [ ] customTalkUpload(companyId, title, bodyMd, tags): company talks
 *       alongside the seed set.
 * - [ ] Printable render of any talk (the paper escape hatch builds trust).
 */

export function scheduleWeek(): Promise<void> {
  throw new Error("Not implemented");
}

export function fanOut(): Promise<void> {
  throw new Error("Not implemented");
}
