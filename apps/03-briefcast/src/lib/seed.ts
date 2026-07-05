/**
 * Demo seed: a realistic brief so a new org's screens render with plausible
 * sales-call content (never lorem, per DESIGN_LANGUAGE rule 8) before their
 * first real meeting processes. Idempotent — runs once per org.
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export async function seedDemoMeeting(orgId: string, organizerUserId: string): Promise<void> {
  const existing = await db.query.meetings.findFirst({
    where: and(eq(schema.meetings.orgId, orgId), eq(schema.meetings.calendarEventId, "demo-seed")),
  });
  if (existing) return;

  const start = new Date();
  start.setDate(start.getDate() - 1);
  start.setHours(14, 0, 0, 0);

  const [deal] = await db
    .insert(schema.deals)
    .values({
      orgId,
      name: "Acme Corp — Platform renewal",
      stage: "Discovery",
      amountCents: 4_800_000,
      closeDate: "2026-08-30",
      owner: "You",
      lastMeetingAt: start,
      signals: [
        { text: "Commitment: intro to CFO for pricing sign-off", at: "2026-05-28", kind: "commitment" },
        { text: "Objection: current tool contract runs through Q3", at: "2026-06-01", kind: "objection" },
      ],
    })
    .returning();

  const [meeting] = await db
    .insert(schema.meetings)
    .values({
      orgId,
      organizerUserId,
      calendarEventId: "demo-seed",
      title: "Acme Corp — discovery call",
      platform: "zoom",
      startsAt: start,
      durationSeconds: 41 * 60,
      attendees: [
        { name: "Sarah Chen", email: "sarah@acme.example" },
        { name: "Marcus Ford", email: "marcus@acme.example" },
      ],
      isExternal: true,
      status: "ready",
    })
    .returning();

  await db.insert(schema.meetingDealLinks).values({
    meetingId: meeting.id,
    dealId: deal.id,
    matchMethod: "attendee_email",
    confidence: 95,
  });

  await db.insert(schema.summaries).values({
    meetingId: meeting.id,
    model: "demo",
    overview:
      "Acme is actively evaluating a platform switch ahead of their Q3 renewal. Sarah (VP Ops) confirmed budget is approved for the upgraded tier; the blocker is a CFO sign-off on pricing, which she offered to arrange. Marcus raised that their incumbent contract runs through end of Q3, so timing matters more than price.",
    decisions: [
      { text: "Move forward with a tailored proposal for the Business tier." },
      { text: "Target a signed agreement before the Q3 incumbent contract lapses." },
    ],
    risks: [{ text: "Budget owner (CFO) has not yet been in a call — approval is second-hand." }],
    nextSteps: "Send revised SOW, then get 20 minutes with the CFO.",
    crmFieldProposals: [
      { object: "deal", property: "dealstage", label: "DEAL STAGE", oldValue: "Discovery", newValue: "Proposal", confidence: 92 },
      { object: "deal", property: "hs_next_step", label: "NEXT STEP", oldValue: null, newValue: "Send revised SOW; book CFO pricing call", confidence: 88 },
      { object: "deal", property: "closedate", label: "CLOSE DATE", oldValue: "2026-09-30", newValue: "2026-08-30", confidence: 74 },
    ],
    tokenUsage: { input: 0, output: 0 },
  });

  await db.insert(schema.actionItems).values([
    { meetingId: meeting.id, text: "Send revised SOW with Business-tier pricing", ownerName: "You", dueDate: "2026-06-12", status: "open" },
    { meetingId: meeting.id, text: "Book 20 min with Acme's CFO for pricing sign-off", ownerName: "Sarah Chen", dueDate: "2026-06-16", status: "open" },
    { meetingId: meeting.id, text: "Confirm incumbent contract end date in writing", ownerName: "You", dueDate: "2026-06-13", status: "open" },
  ]);

  const [t] = await db
    .insert(schema.transcripts)
    .values({ meetingId: meeting.id, provider: "deepgram", durationSeconds: 41 * 60, wordCount: 5800, status: "ready" })
    .returning();
  await db.insert(schema.transcriptSegments).values([
    { transcriptId: t.id, idx: 0, speakerLabel: "Sarah Chen", startMs: 84_000, endMs: 92_000, text: "Budget's approved on our side for the upgraded tier — that's not the holdup." },
    { transcriptId: t.id, idx: 1, speakerLabel: "You", startMs: 92_000, endMs: 98_000, text: "Good to hear. So what does the sign-off path look like from here?" },
    { transcriptId: t.id, idx: 2, speakerLabel: "Sarah Chen", startMs: 98_000, endMs: 110_000, text: "Our CFO needs to bless the pricing. I can get you 20 minutes with her next week." },
    { transcriptId: t.id, idx: 3, speakerLabel: "Marcus Ford", startMs: 110_000, endMs: 121_000, text: "One thing — our current contract runs through the end of Q3, so we can't fully switch before then." },
  ]);
}
