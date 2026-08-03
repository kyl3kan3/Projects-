/**
 * src/lib/presets.ts
 *
 * The built-in templates and the starter campaign every new practice gets.
 *
 * A brand-new account whose first screen after the import is "write your first
 * email" does not run a campaign that week. These four are written the way a
 * well-run practice actually writes to patients: no exclamation marks, no "we
 * miss you!!", no clinical detail in a subject line, the appointment as the
 * subject of every sentence.
 *
 * Pure data, so both signup and `npm run db:seed` use the same copy.
 */

export interface TemplatePreset {
  key: string;
  channel: "email" | "sms";
  name: string;
  subject: string | null;
  body: string;
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    key: "email_day0",
    channel: "email",
    name: "Winback — first email",
    subject: "Time for your next cleaning, {{first_name}}?",
    body: `Hi {{first_name}},

Our records show your last visit with us was {{last_visit}}, which means your cleaning has been due since {{due_since}}. We have kept your spot on the recall list.

Pick a time that suits you and we will call to confirm:
{{booking_link}}

If it is easier to talk it through, we are on {{location_phone}}.

— The team at {{location_name}}`,
  },
  {
    key: "email_day7",
    channel: "email",
    name: "Winback — second email",
    subject: "Two openings this week, {{first_name}}",
    body: `Hi {{first_name}},

A short note in case the last one arrived at a busy moment. We have hygiene openings this week and next, and your cleaning has been due since {{due_since}}.

Choose a window here and we will confirm by phone:
{{booking_link}}

If you have moved practices, reply and let us know — we will take you off the recall list.

— The team at {{location_name}}`,
  },
  {
    key: "sms_day14",
    channel: "sms",
    name: "Winback — text",
    subject: null,
    body: `Hi {{first_name}}, it's {{location_name}}. Your cleaning has been due since {{due_since}} — pick a time here and we'll confirm: {{booking_link}}`,
  },
  {
    key: "email_long_lapse",
    channel: "email",
    name: "Long lapse — 24 months+",
    subject: "Still your dental records, whenever you want them",
    body: `Hi {{first_name}},

It has been a while — our last visit note for you is {{last_visit}}. No lecture: things get busy, and a lot of people come back after a gap this long.

Your chart, x-rays and history are all still here. When you are ready, pick a window and we will confirm by phone:
{{booking_link}}

Or call us on {{location_phone}}.

— The team at {{location_name}}`,
  },
];

/** The starter campaign: email day 0, email day 7 (SMS day 14 on Recall Engine). */
export interface StarterStep {
  templateKey: string;
  offsetDays: number;
  channel: "email" | "sms";
}

export const STARTER_CAMPAIGN = {
  name: "6–12 month winback",
  buckets: ["m6_12"],
  steps: [
    { templateKey: "email_day0", offsetDays: 0, channel: "email" as const },
    { templateKey: "email_day7", offsetDays: 7, channel: "email" as const },
    { templateKey: "sms_day14", offsetDays: 14, channel: "sms" as const },
  ] satisfies StarterStep[],
};

/** The booking page's default friendly line, editable per location. */
export const DEFAULT_BOOKING_NOTICE =
  "Tell us when suits and the front desk will call you back to confirm the time. Cleanings run about 45 minutes.";
