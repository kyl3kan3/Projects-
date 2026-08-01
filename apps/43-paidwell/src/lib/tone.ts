/**
 * The firm's voice.
 *
 * This is the product's differentiation, so it is worth being explicit about
 * what "good" means here. Every competitor's output announces itself: "Dear
 * valued customer, invoice #4482 is overdue. Please remit payment
 * immediately." A firm that sends that to a client it wants to keep has paid us
 * to damage a relationship.
 *
 * So the rules the copy in this file obeys:
 *
 *  - Escalation happens in the *wording*, never in volume or threat. The final
 *    notice is still a sentence a founder would be happy to have sent in their
 *    name, and it says the next message will come from a person.
 *  - It always offers the client a way out that isn't money: a date. "Tell me
 *    when" is as useful to a cash-flow forecast as a payment.
 *  - It assumes the boring truth — the invoice is stuck in someone's approvals
 *    queue — rather than implying bad faith.
 *  - No "immediately", no "legal action", no "debt collection", no exclamation
 *    marks, no emoji. There is a test that asserts this.
 *
 * Rendering is pure: templates in, subject/text/html out. Nothing here reads the
 * database or the clock, so the approval tray can preview the exact bytes that
 * would be sent.
 */

import type { EscalationLevel, TonePreset } from "@/db/schema";
import { reminderEmailHtml, reminderEmailText } from "@/emails/reminder";

/* ---------------------------------------------------------- merge fields --- */

export interface MergeContext {
  contactFirstName: string;
  clientName: string;
  firmName: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  daysOverdue: number;
  daysUntilDue: number;
  portalUrl: string;
  signature: string;
  /** Set on promise-aware sends: the date they told us. */
  promiseDate?: string;
}

export interface MergeField {
  token: string;
  label: string;
  sample: string;
}

/** Every field a firm may use in a custom template, with a live sample. */
export const MERGE_FIELDS: MergeField[] = [
  { token: "contact_first_name", label: "Contact first name", sample: "Dana" },
  { token: "client_name", label: "Client company", sample: "Meridian Co" },
  { token: "firm_name", label: "Your firm", sample: "Northbank Studio" },
  { token: "invoice_number", label: "Invoice number", sample: "INV-2041" },
  { token: "amount", label: "Balance outstanding", sample: "$12,400.00" },
  { token: "due_date", label: "Due date", sample: "10 Jul 2026" },
  { token: "days_overdue", label: "Days overdue", sample: "21" },
  { token: "days_until_due", label: "Days until due", sample: "3" },
  { token: "portal_link", label: "Payment link", sample: "https://paidwell.app/portal/…" },
  { token: "promise_date", label: "Promised date", sample: "12 Jul 2026" },
  { token: "signature", label: "Your signature block", sample: "Ana Reyes\nNorthbank Studio" },
];

const TOKEN_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

function valuesFor(ctx: MergeContext): Record<string, string> {
  return {
    contact_first_name: ctx.contactFirstName,
    client_name: ctx.clientName,
    firm_name: ctx.firmName,
    invoice_number: ctx.invoiceNumber,
    amount: ctx.amount,
    due_date: ctx.dueDate,
    days_overdue: String(ctx.daysOverdue),
    days_until_due: String(ctx.daysUntilDue),
    portal_link: ctx.portalUrl,
    promise_date: ctx.promiseDate ?? "the date we agreed",
    signature: ctx.signature,
  };
}

/** Substitute merge fields. An unknown token is left visible, never blanked. */
export function renderTemplate(template: string, ctx: MergeContext): string {
  const values = valuesFor(ctx);
  return template.replace(TOKEN_RE, (whole, token: string) =>
    token in values ? values[token] : whole,
  );
}

export interface TemplateProblem {
  field: "subject" | "body";
  message: string;
}

/**
 * Validate a template a firm edited. Returns problems rather than throwing: the
 * editor shows them inline, and a broken template must never reach a client.
 */
export function validateTemplate(subject: string, body: string): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  const known = new Set(MERGE_FIELDS.map((f) => f.token));

  if (!subject.trim()) problems.push({ field: "subject", message: "A subject line is required." });
  if (subject.length > 120) {
    problems.push({ field: "subject", message: "Keep the subject under 120 characters — inboxes truncate." });
  }
  if (!body.trim()) problems.push({ field: "body", message: "The message body is required." });

  for (const [field, text] of [["subject", subject], ["body", body]] as const) {
    for (const match of text.matchAll(TOKEN_RE)) {
      if (!known.has(match[1])) {
        problems.push({ field, message: `Unknown merge field {{${match[1]}}}.` });
      }
    }
    // A single brace pair is almost always a typo for a merge field.
    const stray = text.replace(TOKEN_RE, "").match(/\{[^{}]*\}/);
    if (stray) {
      problems.push({ field, message: `${stray[0]} is not a merge field — use {{double braces}}.` });
    }
  }

  if (!body.includes("{{portal_link}}")) {
    problems.push({
      field: "body",
      message: "Include {{portal_link}} so the client can pay without replying.",
    });
  }
  return problems;
}

/* ------------------------------------------------------------------ copy --- */

export interface StepCopy {
  subject: string;
  /** Paragraphs, in order. */
  body: string[];
}

type LevelCopy = Record<EscalationLevel, StepCopy>;

const WARM: LevelCopy = {
  1: {
    subject: "{{invoice_number}} — due {{due_date}}",
    body: [
      "Hi {{contact_first_name}},",
      "A quick heads-up before it slips past anyone: invoice {{invoice_number}} for {{amount}} falls due on {{due_date}}. If it's already scheduled, there's nothing here for you to do.",
      "The invoice and a card or bank payment option are here whenever you need them: {{portal_link}}",
      "{{signature}}",
    ],
  },
  2: {
    subject: "{{invoice_number}} — a gentle nudge",
    body: [
      "Hi {{contact_first_name}},",
      "Invoice {{invoice_number}} for {{amount}} came due on {{due_date}}, so it's {{days_overdue}} days past now. In my experience that usually means it's sitting in an approvals queue rather than anything being wrong.",
      "If you can give it a nudge internally, or reply with the date you expect it to clear, that would be a real help. You can also settle it in a couple of taps here: {{portal_link}}",
      "{{signature}}",
    ],
  },
  3: {
    subject: "{{invoice_number}} is {{days_overdue}} days overdue",
    body: [
      "Hi {{contact_first_name}},",
      "Invoice {{invoice_number}} for {{amount}} is now {{days_overdue}} days past its due date of {{due_date}}, and I haven't been able to move it along from my end.",
      "Could you either settle it here — {{portal_link}} — or reply with the date it will be paid? Honestly, a date is nearly as useful to me as the money; I just need to know what to plan around.",
      "{{signature}}",
    ],
  },
  4: {
    subject: "{{invoice_number}} — {{amount}} outstanding after {{days_overdue}} days",
    body: [
      "Hi {{contact_first_name}},",
      "This is the last note you'll get from our system about invoice {{invoice_number}}. {{amount}} has been outstanding for {{days_overdue}} days against the terms we agreed, and I'd much rather close it between the two of us than escalate it.",
      "Two ways to finish it today: pay in full at {{portal_link}}, or reply with a date and an amount you can commit to and I will work with that.",
      "After this, anything further about this invoice comes from me directly rather than from a reminder.",
      "{{signature}}",
    ],
  },
};

const NEUTRAL: LevelCopy = {
  1: {
    subject: "{{invoice_number}} due {{due_date}} — {{amount}}",
    body: [
      "Hi {{contact_first_name}},",
      "Invoice {{invoice_number}} for {{amount}} is due on {{due_date}}, in {{days_until_due}} days. No action needed if it's already in your payment run.",
      "Invoice PDF and payment options: {{portal_link}}",
      "{{signature}}",
    ],
  },
  2: {
    subject: "{{invoice_number}} — {{amount}} now due",
    body: [
      "Hi {{contact_first_name}},",
      "Invoice {{invoice_number}} for {{amount}} was due on {{due_date}} and is {{days_overdue}} days outstanding.",
      "You can pay it here: {{portal_link}}, or reply with the date it's scheduled for. If it needs a PO number, a resend, or a different contact, tell me and I'll sort it out.",
      "{{signature}}",
    ],
  },
  3: {
    subject: "Overdue: {{invoice_number}}, {{days_overdue}} days ({{amount}})",
    body: [
      "Hi {{contact_first_name}},",
      "Invoice {{invoice_number}} for {{amount}} is {{days_overdue}} days overdue. Due date was {{due_date}}.",
      "Please either pay it at {{portal_link}} or confirm the date it will be paid, so I can plan around it.",
      "{{signature}}",
    ],
  },
  4: {
    subject: "Final reminder: {{invoice_number}} — {{amount}}, {{days_overdue}} days overdue",
    body: [
      "Hi {{contact_first_name}},",
      "This is the final reminder in this sequence for invoice {{invoice_number}}: {{amount}}, {{days_overdue}} days past the agreed terms.",
      "Please settle it at {{portal_link}}, or reply with a payment date and amount. If there's a dispute or a problem with the invoice itself, tell me and I'll pause everything while we resolve it.",
      "Anything after this will come from me directly.",
      "{{signature}}",
    ],
  },
};

const FIRM: LevelCopy = {
  1: {
    subject: "{{invoice_number}} — {{amount}} due {{due_date}}",
    body: [
      "Hi {{contact_first_name}},",
      "Invoice {{invoice_number}}, {{amount}}, is due {{due_date}}. Payment link: {{portal_link}}",
      "{{signature}}",
    ],
  },
  2: {
    subject: "{{invoice_number}} past due — {{amount}}",
    body: [
      "Hi {{contact_first_name}},",
      "Invoice {{invoice_number}} for {{amount}} was due {{due_date}} and is {{days_overdue}} days past due.",
      "Please pay at {{portal_link}}, or tell me the date it will clear.",
      "{{signature}}",
    ],
  },
  3: {
    subject: "{{days_overdue}} days overdue: {{invoice_number}} ({{amount}})",
    body: [
      "Hi {{contact_first_name}},",
      "{{amount}} on invoice {{invoice_number}} is {{days_overdue}} days past the terms we agreed. I've had no reply to earlier messages.",
      "I need one of two things this week: payment at {{portal_link}}, or a committed date in writing.",
      "{{signature}}",
    ],
  },
  4: {
    subject: "Final notice — {{invoice_number}}, {{amount}}",
    body: [
      "Hi {{contact_first_name}},",
      "Final notice on invoice {{invoice_number}}: {{amount}}, {{days_overdue}} days beyond terms.",
      "Pay at {{portal_link}}, or reply today with a date and amount. Without either, I'll stop the automatic reminders and handle this myself, which neither of us wants to spend time on.",
      "{{signature}}",
    ],
  },
};

const PRESETS: Record<TonePreset, LevelCopy> = { warm: WARM, neutral: NEUTRAL, firm: FIRM };

/**
 * Promise-aware variants. Used only when the ladder advances because a promised
 * date passed unpaid — the whole point being that the copy must acknowledge the
 * conversation that already happened. Sending a generic "gentle nudge" to
 * someone who told you Friday is how a firm loses credibility.
 */
const PROMISE_AWARE: Record<TonePreset, StepCopy> = {
  warm: {
    subject: "{{invoice_number}} — we'd said {{promise_date}}",
    body: [
      "Hi {{contact_first_name}},",
      "We'd agreed on {{promise_date}} for invoice {{invoice_number}} ({{amount}}), and it hasn't come through — which I assume means something got in the way rather than anything deliberate.",
      "If it's now cleared and I'm behind, ignore me entirely. If not, either pay it here — {{portal_link}} — or give me a new date and I'll hold to that one instead.",
      "{{signature}}",
    ],
  },
  neutral: {
    subject: "{{invoice_number}} — payment expected {{promise_date}}",
    body: [
      "Hi {{contact_first_name}},",
      "Invoice {{invoice_number}} ({{amount}}) was expected on {{promise_date}} and hasn't arrived. It's now {{days_overdue}} days past the original due date of {{due_date}}.",
      "Please pay at {{portal_link}}, or send me a revised date so I can update our records.",
      "{{signature}}",
    ],
  },
  firm: {
    subject: "{{invoice_number}} — {{promise_date}} passed, {{amount}} still open",
    body: [
      "Hi {{contact_first_name}},",
      "{{promise_date}} was the date you gave me for invoice {{invoice_number}}. {{amount}} is still outstanding, {{days_overdue}} days beyond terms.",
      "Pay at {{portal_link}} today, or reply with a date you can hold to.",
      "{{signature}}",
    ],
  },
};

/** The stock copy for a rung, before any per-step override the firm has saved. */
export function stepCopy(
  tone: TonePreset,
  level: EscalationLevel,
  promiseAware = false,
): StepCopy {
  if (promiseAware) return PROMISE_AWARE[tone] ?? PROMISE_AWARE.warm;
  return (PRESETS[tone] ?? WARM)[level];
}

export const TONE_LABELS: Record<TonePreset, { name: string; blurb: string }> = {
  warm: {
    name: "Warm",
    blurb: "Reads like your best account manager. Assumes an approvals queue, not bad faith.",
  },
  neutral: {
    name: "Neutral",
    blurb: "Businesslike and plain. The default for clients you deal with through a finance contact.",
  },
  firm: {
    name: "Firm",
    blurb: "Short, direct, unmistakably a request. Still nothing you'd wince at having sent.",
  },
};

/* ------------------------------------------------------------- rendering --- */

export interface RenderedMessage {
  subject: string;
  text: string;
  html: string;
}

export interface RenderStepArgs {
  tone: TonePreset;
  level: EscalationLevel;
  promiseAware?: boolean;
  /** Per-step overrides saved on the sequence. */
  overrideSubject?: string;
  overrideBody?: string;
  /** Off by default; only ever appears from level 3 up. */
  lateFeeSentence?: string;
  ctx: MergeContext;
}

/**
 * Render one step to the exact bytes that would be sent. Used by the sender and
 * by the approval tray's preview — the same function, so what a firm approves is
 * what the client receives.
 */
export function renderStep(args: RenderStepArgs): RenderedMessage {
  const stock = stepCopy(args.tone, args.level, args.promiseAware);
  const subjectTemplate = args.overrideSubject?.trim() || stock.subject;
  const paragraphs = args.overrideBody?.trim()
    ? args.overrideBody.trim().split(/\n{2,}/)
    : [...stock.body];

  // The late-fee sentence is a firm-level decision, off by default, and it never
  // appears on an early nudge — mentioning fees on day three reads as a threat.
  if (args.lateFeeSentence?.trim() && args.level >= 3) {
    const signatureIndex = paragraphs.findIndex((p) => p.includes("{{signature}}"));
    const insertAt = signatureIndex === -1 ? paragraphs.length : signatureIndex;
    paragraphs.splice(insertAt, 0, args.lateFeeSentence.trim());
  }

  const rendered = paragraphs.map((p) => renderTemplate(p, args.ctx));
  const subject = renderTemplate(subjectTemplate, args.ctx);

  const emailProps = {
    firmName: args.ctx.firmName,
    paragraphs: rendered,
    invoiceNumber: args.ctx.invoiceNumber,
    amountFormatted: args.ctx.amount,
    dueDateFormatted: args.ctx.dueDate,
    portalUrl: args.ctx.portalUrl,
    statusLine:
      args.ctx.daysOverdue > 0
        ? `${args.ctx.daysOverdue} ${args.ctx.daysOverdue === 1 ? "day" : "days"} past due`
        : `due in ${args.ctx.daysUntilDue} ${args.ctx.daysUntilDue === 1 ? "day" : "days"}`,
  };

  return {
    subject,
    text: reminderEmailText(emailProps),
    html: reminderEmailHtml(emailProps),
  };
}
