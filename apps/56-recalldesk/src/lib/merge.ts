/**
 * src/lib/merge.ts
 *
 * Template rendering for campaign touches: `{{first_name}}`, `{{booking_link}}`
 * and friends. Pure, so the campaign editor's live preview and the sender render
 * through exactly the same code — a preview that is not the message is worse than
 * no preview.
 *
 * Two rules that are not cosmetic:
 *
 * 1. **An unknown or empty merge field is a render error, not an empty string.**
 *    "Hi , it's been a while" going to four hundred patients is the kind of thing
 *    a practice never lives down. `renderTemplate` reports the missing fields and
 *    the sender refuses to send.
 *
 * 2. **Every SMS body carries STOP language and every email an unsubscribe
 *    link.** Not as a template the office can delete — appended by the renderer.
 */

export type MergeField =
  | "first_name"
  | "last_name"
  | "practice_name"
  | "location_name"
  | "location_phone"
  | "due_since"
  | "last_visit"
  | "booking_link"
  | "unsubscribe_link";

export const MERGE_FIELDS: MergeField[] = [
  "first_name",
  "last_name",
  "practice_name",
  "location_name",
  "location_phone",
  "due_since",
  "last_visit",
  "booking_link",
  "unsubscribe_link",
];

export function mergeFieldHint(f: MergeField): string {
  switch (f) {
    case "first_name":
      return "Rosalind";
    case "last_name":
      return "Mbeki";
    case "practice_name":
      return "Cedar Hollow Dental";
    case "location_name":
      return "Cedar Hollow — Maple St";
    case "location_phone":
      return "(512) 555-0147";
    case "due_since":
      return "May 2025";
    case "last_visit":
      return "Nov 2024";
    case "booking_link":
      return "https://recalldesk.app/book/…";
    case "unsubscribe_link":
      return "https://recalldesk.app/stop/…";
  }
}

export type MergeValues = Partial<Record<MergeField, string>>;

export interface RenderResult {
  text: string;
  /** Fields referenced by the template that had no value. Blocks sending. */
  missing: MergeField[];
  /** Referenced names that are not merge fields at all. Blocks sending. */
  unknown: string[];
}

const TOKEN = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function renderTemplate(body: string, values: MergeValues): RenderResult {
  const missing = new Set<MergeField>();
  const unknown = new Set<string>();

  const text = body.replace(TOKEN, (_m, rawName: string) => {
    const name = rawName as MergeField;
    if (!MERGE_FIELDS.includes(name)) {
      unknown.add(rawName);
      return `{{${rawName}}}`;
    }
    const value = values[name];
    if (value === undefined || value === null || value.trim() === "") {
      missing.add(name);
      return `{{${rawName}}}`;
    }
    return value;
  });

  return { text, missing: [...missing], unknown: [...unknown] };
}

/** The fields a template actually uses — the editor lists them under the body. */
export function fieldsUsed(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(TOKEN)) out.add(m[1]);
  return [...out];
}

/**
 * SMS bodies get STOP language appended when they do not already carry it, and
 * are measured against the 320-character (two-segment) budget. Not a suggestion:
 * a reactivation text without an opt-out instruction is a TCPA problem.
 */
export function finalizeSms(text: string): { body: string; segments: number; tooLong: boolean } {
  const hasStop = /\bstop\b/i.test(text);
  const body = hasStop ? text.trim() : `${text.trim()} Reply STOP to opt out.`;
  const segments = Math.max(1, Math.ceil(body.length / 160));
  return { body, segments, tooLong: body.length > 320 };
}

/**
 * Email bodies get an unsubscribe line when the template did not include the
 * link itself. The link is a real tokenized URL, not "reply to unsubscribe".
 */
export function finalizeEmail(text: string, unsubscribeUrl: string): string {
  if (text.includes(unsubscribeUrl)) return text.trim();
  return `${text.trim()}\n\n—\nDon't want recall reminders? Unsubscribe: ${unsubscribeUrl}`;
}

/**
 * Deliverability lint on the copy itself (README's risk 6: "template linting —
 * no URL shorteners, no all-caps FREE"). Warnings, shown in the editor; they do
 * not block a send, because the office knows their patients better than we do.
 */
export interface CopyWarning {
  code: string;
  message: string;
}

const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co/", "goo.gl", "ow.ly", "buff.ly"];

export function lintCopy(input: { subject?: string | null; body: string; channel: "email" | "sms" }): CopyWarning[] {
  const warnings: CopyWarning[] = [];
  const all = `${input.subject ?? ""} ${input.body}`;

  for (const s of SHORTENERS) {
    if (all.toLowerCase().includes(s)) {
      warnings.push({
        code: "shortener",
        message: `${s} is a link shortener — spam filters treat it as a hidden destination. Use the {{booking_link}} field.`,
      });
      break;
    }
  }

  const shouty = all.match(/\b[A-Z]{4,}\b/g)?.filter((w) => w !== "STOP" && w !== "HELP");
  if (shouty && shouty.length > 0) {
    warnings.push({
      code: "all_caps",
      message: `"${shouty[0]}" is in all caps. Filters read shouting as promotional.`,
    });
  }

  if (/\bfree\b/i.test(all) && /!/.test(all)) {
    warnings.push({
      code: "free_bang",
      message: '"Free" plus an exclamation mark is a classic spam signature. Say what the visit is instead.',
    });
  }

  if (input.channel === "email" && !input.subject?.trim()) {
    warnings.push({ code: "no_subject", message: "This email has no subject line." });
  }

  if (input.channel === "email" && /\b(cavity|cavities|perio|periodontal|x-ray|treatment plan|diagnos)/i.test(input.subject ?? "")) {
    warnings.push({
      code: "phi_subject",
      message: "Clinical words do not belong in a subject line — it is visible on a lock screen. Keep it to the appointment.",
    });
  }

  if (!input.body.includes("{{booking_link}}")) {
    warnings.push({
      code: "no_link",
      message: "No {{booking_link}} — the patient has no way to answer except calling.",
    });
  }

  return warnings;
}
