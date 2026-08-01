/**
 * Starter documents.
 *
 * Three proposal templates a freelancer can actually send, plus the contract
 * template the chain fills in from an accepted proposal. Wording is deliberately
 * plain — a clause a client can read in one pass gets signed the same day, and
 * these are the clauses freelancers actually argue about: deposit, revisions,
 * ownership on payment, kill fee.
 *
 * Not legal advice, and the app says so on the settings screen. It is a starting
 * point that beats the template-site PDF the README describes people retyping.
 */

import { randomUUID } from "node:crypto";
import type { BlockContent, DocBlock, LineItem, TermClause } from "@/db/schema";
import { formatMoney } from "@/lib/money";

export type DraftBlock = { kind: DocBlock["kind"]; position: number; content: BlockContent };

function line(
  description: string,
  quantity: number,
  unitAmount: number,
  options: { optional?: boolean; taxable?: boolean } = {},
): LineItem {
  return {
    id: randomUUID(),
    description,
    quantity,
    unitAmount,
    optional: options.optional ?? false,
    selected: !(options.optional ?? false),
    taxable: options.taxable ?? true,
  };
}

export interface TemplateContext {
  clientName: string;
  clientCompany: string;
  freelancerName: string;
  currency: string;
}

export interface Template {
  id: string;
  name: string;
  summary: string;
  /** Suggested document title, with the client's name filled in. */
  title: (ctx: TemplateContext) => string;
  depositPercent: number;
  netDays: number;
  blocks: (ctx: TemplateContext) => DraftBlock[];
}

export const TEMPLATES: Template[] = [
  {
    id: "web-design",
    name: "Web design proposal",
    summary: "Discovery, design, build. Deposit 50%, net 14, two add-ons.",
    title: (ctx) => `Website redesign — ${ctx.clientCompany || ctx.clientName}`,
    depositPercent: 50,
    netDays: 14,
    blocks: (ctx) => [
      {
        kind: "heading",
        position: 0,
        content: { kind: "heading", text: "What we're building" },
      },
      {
        kind: "text",
        position: 1,
        content: {
          kind: "text",
          body: `A five-page website for ${ctx.clientCompany || ctx.clientName}: home, menu, about, visit, and a contact page that puts your phone number and hours where people look for them. Designed mobile-first — most of your visitors arrive on a phone, standing outside deciding whether to come in.\n\nI'll work from your existing photography and wordmark. Two rounds of revisions are included at the design stage, and I'll hand over a site you can edit yourself.`,
        },
      },
      {
        kind: "pricing_table",
        position: 2,
        content: {
          kind: "pricing_table",
          caption: "Fees",
          lines: [
            line("Discovery call, sitemap, and content plan", 1, 60_000),
            line("Design — five pages, mobile and desktop", 1, 180_000),
            line("Build and launch on your hosting", 1, 200_000),
            line("Copywriting for all five pages", 1, 80_000, { optional: true }),
            line("Three months of small changes after launch", 3, 20_000, { optional: true }),
          ],
        },
      },
      {
        kind: "terms",
        position: 3,
        content: {
          kind: "terms",
          clauses: [
            {
              heading: "Schedule",
              body: "Four weeks from deposit to launch, assuming feedback within three working days at each stage.",
            },
            {
              heading: "Revisions",
              body: "Two rounds of design revisions are included. Further rounds are billed at $95/hour, agreed in advance.",
            },
          ],
        },
      },
    ],
  },
  {
    id: "consulting-retainer",
    name: "Consulting retainer",
    summary: "Monthly block of hours. Deposit 25%, net 7, rolls over once.",
    title: (ctx) => `Advisory retainer — ${ctx.clientCompany || ctx.clientName}`,
    depositPercent: 25,
    netDays: 7,
    blocks: (ctx) => [
      { kind: "heading", position: 0, content: { kind: "heading", text: "How we'll work" } },
      {
        kind: "text",
        position: 1,
        content: {
          kind: "text",
          body: `A standing block of twelve hours a month for ${ctx.clientCompany || ctx.clientName}: a weekly 45-minute call, written follow-ups, and asynchronous review of anything you send between calls.\n\nUnused hours roll into the following month once, then expire. If a month needs more than twelve hours we agree the overage before I start on it — never after.`,
        },
      },
      {
        kind: "pricing_table",
        position: 2,
        content: {
          kind: "pricing_table",
          caption: "Monthly fees",
          lines: [
            line("Advisory retainer — 12 hours", 12, 18_500),
            line("Quarterly written strategy review", 1, 95_000, { optional: true }),
          ],
        },
      },
      {
        kind: "terms",
        position: 3,
        content: {
          kind: "terms",
          clauses: [
            {
              heading: "Term and notice",
              body: "Rolling monthly. Either of us can end it with 30 days' written notice; the notice month is payable in full.",
            },
            {
              heading: "Confidentiality",
              body: "Everything you share stays between us, indefinitely, and I won't advise a direct competitor while the retainer runs.",
            },
          ],
        },
      },
    ],
  },
  {
    id: "brand-identity",
    name: "Brand identity project",
    summary: "Wordmark, palette, and a one-page guide. Deposit 40%, net 14.",
    title: (ctx) => `Brand identity — ${ctx.clientCompany || ctx.clientName}`,
    depositPercent: 40,
    netDays: 14,
    blocks: (ctx) => [
      { kind: "heading", position: 0, content: { kind: "heading", text: "Scope" } },
      {
        kind: "text",
        position: 1,
        content: {
          kind: "text",
          body: `A complete identity for ${ctx.clientCompany || ctx.clientName}: a wordmark drawn from scratch, a secondary mark for small spaces, a five-colour palette, type pairing, and a one-page guide showing how they go together.\n\nYou'll see two directions at the first presentation. We take one forward — not a blend of both, which is how identities end up looking like committees made them.`,
        },
      },
      {
        kind: "pricing_table",
        position: 2,
        content: {
          kind: "pricing_table",
          caption: "Fees",
          lines: [
            line("Research and two design directions", 1, 140_000),
            line("Refinement of the chosen direction", 1, 110_000),
            line("Wordmark, secondary mark, and file pack", 1, 90_000),
            line("One-page usage guide", 1, 45_000),
            line("Business card and signage artwork", 2, 35_000, { optional: true }),
          ],
        },
      },
      {
        kind: "terms",
        position: 3,
        content: {
          kind: "terms",
          clauses: [
            {
              heading: "Ownership",
              body: "Full ownership of the final marks transfers to you on final payment. I keep the right to show the work in my portfolio.",
            },
            {
              heading: "Sketches and rejected directions",
              body: "The direction we don't take stays mine, and won't be shown or sold to anyone else.",
            },
          ],
        },
      },
    ],
  },
];

export function template(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

/** An empty proposal, for people who want to write their own from the start. */
export function blankProposalBlocks(ctx: TemplateContext): DraftBlock[] {
  return [
    { kind: "heading", position: 0, content: { kind: "heading", text: "Scope of work" } },
    {
      kind: "text",
      position: 1,
      content: {
        kind: "text",
        body: `What I'll deliver for ${ctx.clientCompany || ctx.clientName}, in plain language, and what is explicitly not included.`,
      },
    },
    {
      kind: "pricing_table",
      position: 2,
      content: {
        kind: "pricing_table",
        caption: "Fees",
        lines: [line("Project fee", 1, 100_000)],
      },
    },
    {
      kind: "terms",
      position: 3,
      content: {
        kind: "terms",
        clauses: [
          { heading: "Schedule", body: "Start date, milestones, and what each depends on." },
        ],
      },
    },
  ];
}

/* ---------------------------------------------------------------- contract --- */

export interface ContractContext {
  clientName: string;
  clientCompany: string | null;
  freelancerName: string;
  currency: string;
  total: number;
  depositPercent: number;
  netDays: number;
  proposalTitle: string;
}

/**
 * The clauses appended to the scope snapshot when a proposal becomes a contract.
 * The money sentences are generated from the accepted figures, so the contract
 * cannot disagree with the proposal it came from.
 */
export function contractClauses(ctx: ContractContext): TermClause[] {
  const party = ctx.clientCompany || ctx.clientName;
  const total = formatMoney(ctx.total, ctx.currency);
  const deposit = Math.round((ctx.total * ctx.depositPercent) / 100);
  const clauses: TermClause[] = [
    {
      heading: "Parties and scope",
      body: `This agreement is between ${ctx.freelancerName} ("the Contractor") and ${party} ("the Client"), and covers the work set out above, accepted from “${ctx.proposalTitle}”. Anything not listed there is out of scope until both parties agree it in writing.`,
    },
    {
      heading: "Fees",
      body:
        ctx.depositPercent > 0
          ? `The total fee is ${total}. A deposit of ${formatMoney(deposit, ctx.currency)} (${ctx.depositPercent}%) is invoiced on signature and work begins once it clears. The balance is invoiced on completion, payable within ${ctx.netDays} days.`
          : `The total fee is ${total}, invoiced on completion and payable within ${ctx.netDays} days.`,
    },
    {
      heading: "Late payment",
      body: `Invoices unpaid ${ctx.netDays} days after issue may carry interest of 1.5% per month on the outstanding balance. The Contractor may pause work on any overdue invoice after written notice.`,
    },
    {
      heading: "Ownership",
      body: "The Client owns the delivered work outright once every invoice under this agreement is paid in full. Until then the Contractor retains ownership and grants no licence to use it. The Contractor's own tools, libraries, and working files remain theirs.",
    },
    {
      heading: "Changes",
      body: "Either party may propose a change. Nothing outside the scope above is started until the change and its fee are agreed in writing — an email counts.",
    },
    {
      heading: "Cancellation",
      body: "The Client may cancel at any time with written notice. The deposit is non-refundable, and any work completed past the deposit's value is invoiced at the agreed rate. The Contractor may cancel if payment is more than 30 days overdue.",
    },
    {
      heading: "Liability",
      body: `Neither party is liable for indirect or consequential loss. The Contractor's total liability under this agreement is limited to the fees paid under it (${total}).`,
    },
    {
      heading: "Signing",
      body: "Both parties agree that an electronic signature applied through PaperTrail is binding, and that the record of who signed, when, and from where forms part of this agreement.",
    },
  ];
  return clauses;
}

/** The deposit-invoice body: one line, and the arithmetic that produced it. */
export function depositInvoiceBlocks(ctx: {
  depositPercent: number;
  depositAmount: number;
  contractTotal: number;
  currency: string;
  contractTitle: string;
}): DraftBlock[] {
  return [
    {
      kind: "text",
      position: 0,
      content: {
        kind: "text",
        body: `Deposit due on signature of “${ctx.contractTitle}”. The balance of ${formatMoney(
          ctx.contractTotal - ctx.depositAmount,
          ctx.currency,
        )} is invoiced on completion.`,
      },
    },
    {
      kind: "pricing_table",
      position: 1,
      content: {
        kind: "pricing_table",
        caption: "Amount due",
        lines: [
          {
            id: randomUUID(),
            description: `Deposit — ${ctx.depositPercent}% of ${formatMoney(ctx.contractTotal, ctx.currency)}`,
            quantity: 1,
            unitAmount: ctx.depositAmount,
            optional: false,
            selected: true,
            // Tax is already inside the signed total the percentage was taken
            // from, so the deposit line is not taxed again.
            taxable: false,
          },
        ],
      },
    },
  ];
}

/** The balance-invoice body: what was signed, less what was already paid. */
export function balanceInvoiceBlocks(ctx: {
  balanceAmount: number;
  contractTotal: number;
  alreadyInvoiced: number;
  currency: string;
  contractTitle: string;
}): DraftBlock[] {
  return [
    {
      kind: "text",
      position: 0,
      content: {
        kind: "text",
        body: `Final invoice for “${ctx.contractTitle}”. Signed total ${formatMoney(
          ctx.contractTotal,
          ctx.currency,
        )}, less ${formatMoney(ctx.alreadyInvoiced, ctx.currency)} already invoiced.`,
      },
    },
    {
      kind: "pricing_table",
      position: 1,
      content: {
        kind: "pricing_table",
        caption: "Amount due",
        lines: [
          {
            id: randomUUID(),
            description: "Balance on completion",
            quantity: 1,
            unitAmount: ctx.balanceAmount,
            optional: false,
            selected: true,
            taxable: false,
          },
        ],
      },
    },
  ];
}

/** A standalone invoice for work with no proposal behind it. */
export function standaloneInvoiceBlocks(ctx: {
  description: string;
  amount: number;
}): DraftBlock[] {
  return [
    {
      kind: "pricing_table",
      position: 0,
      content: {
        kind: "pricing_table",
        caption: "Amount due",
        lines: [line(ctx.description, 1, ctx.amount)],
      },
    },
  ];
}
