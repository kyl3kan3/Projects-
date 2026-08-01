/**
 * The follow-up email's HTML. Pure string building, no React renderer, no
 * dependency — an AR email has to survive Outlook, so it is a table-free stack
 * of divs with inline styles and nothing clever.
 *
 * It looks like the firm's letterhead, not like ours (DESIGN.md: ivory ground,
 * ink type, hairline rules, one banker green). The firm's name is the header;
 * PaidWell appears once, small, in the footer. No images, no tracking pixel, no
 * emoji — a money request that arrives looking like a marketing blast gets filed
 * under Promotions, which is the same as never sending it.
 *
 * Kept well under Gmail's 102KB clipping threshold: the rendered size is a few
 * kilobytes whatever the copy.
 */

export interface ReminderEmailProps {
  firmName: string;
  /** Already merge-rendered paragraphs, in order. */
  paragraphs: string[];
  invoiceNumber: string;
  amountFormatted: string;
  dueDateFormatted: string;
  portalUrl: string;
  /** "12 400 outstanding · 21 days past due" style line under the amount. */
  statusLine: string;
}

const LEDGER = "#F7F5F0";
const SHEET = "#FFFFFF";
const HAIRLINE = "#E5E1D6";
const INK = "#20261F";
const TEXT2 = "#6E756C";
const TEXT3 = "#9AA096";
const BANKER = "#2F6E52";

const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI','Public Sans',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Source Serif 4','Times New Roman',serif";
const MONO = "'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape, then turn bare URLs into links and single newlines into breaks. */
function paragraphHtml(text: string): string {
  const escaped = escapeHtml(text);
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${url}" style="color:${BANKER};text-decoration:underline">${url}</a>`,
  );
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.55;color:${INK}">${linked.replace(
    /\n/g,
    "<br>",
  )}</p>`;
}

export function reminderEmailHtml(props: ReminderEmailProps): string {
  const body = props.paragraphs.filter((p) => p.trim()).map(paragraphHtml).join("");

  return [
    `<div style="margin:0;padding:24px 12px;background:${LEDGER}">`,
    `<div style="max-width:560px;margin:0 auto;background:${SHEET};border:1px solid ${HAIRLINE};border-radius:12px;padding:24px">`,

    // Letterhead — the firm's name, set in the serif, with a hairline under it.
    `<div style="font-family:${SERIF};font-size:20px;font-weight:600;color:${INK};letter-spacing:-0.01em">${escapeHtml(
      props.firmName,
    )}</div>`,
    `<div style="height:1px;background:${HAIRLINE};margin:16px 0 24px"></div>`,

    body,

    // Invoice summary block: the facts, in mono, so they can be checked at a glance.
    `<div style="border:1px solid ${HAIRLINE};border-radius:12px;padding:16px;margin:24px 0">`,
    `<div style="font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${TEXT3};margin-bottom:8px">Invoice ${escapeHtml(
      props.invoiceNumber,
    )}</div>`,
    `<div style="font-family:${MONO};font-size:24px;font-weight:500;color:${INK}">${escapeHtml(
      props.amountFormatted,
    )}</div>`,
    `<div style="font-family:${MONO};font-size:13px;color:${TEXT2};margin-top:8px">Due ${escapeHtml(
      props.dueDateFormatted,
    )} · ${escapeHtml(props.statusLine)}</div>`,
    `</div>`,

    // One primary action: ink fill, paper text. No gradient, no glow.
    `<div style="margin:24px 0">`,
    `<a href="${props.portalUrl}" style="display:inline-block;background:${INK};color:${LEDGER};font-family:${SANS};font-size:15px;font-weight:600;line-height:1;padding:16px 24px;border-radius:8px;text-decoration:none">View or pay this invoice</a>`,
    `</div>`,

    `<div style="height:1px;background:${HAIRLINE};margin:24px 0 16px"></div>`,
    `<div style="font-family:${SANS};font-size:13px;line-height:1.45;color:${TEXT3}">`,
    `Reply to this email and it reaches a person — all automatic follow-up on this invoice stops the moment you do.`,
    `</div>`,
    `<div style="font-family:${SANS};font-size:11px;line-height:1.45;color:${TEXT3};margin-top:12px">Sent with PaidWell on behalf of ${escapeHtml(
      props.firmName,
    )}.</div>`,

    `</div></div>`,
  ].join("");
}

/** The plain-text alternative, built from the same props. */
export function reminderEmailText(props: ReminderEmailProps): string {
  return [
    ...props.paragraphs,
    "",
    `Invoice ${props.invoiceNumber} — ${props.amountFormatted}`,
    `Due ${props.dueDateFormatted} · ${props.statusLine}`,
    `View or pay: ${props.portalUrl}`,
    "",
    "Reply to this email and it reaches a person — all automatic follow-up on this invoice stops the moment you do.",
  ].join("\n");
}
