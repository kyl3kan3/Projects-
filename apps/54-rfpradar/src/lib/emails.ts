/**
 * src/lib/emails.ts
 *
 * Email and Slack bodies. Pure functions: data in, `{subject, html, text}` out,
 * so every template is testable without a mail provider.
 *
 * Styling is inline (mail clients drop <style>) and follows DESIGN.md's type
 * roles and palette: register paper, ink text, `federal` for the fit score,
 * Overpass Mono for notice ids, deadlines and scores. No emoji, no gradients —
 * the same rules the product UI obeys.
 *
 * Both the email and the Slack post render factor reasons **verbatim**. A digest
 * that shows a bare score would break the product's central rule in the one
 * place nobody would notice.
 */

const INK = "#212832";
const INK_2 = "#606A76";
const INK_3 = "#98A0AB";
const REGISTER = "#F6F6F4";
const CARD = "#FDFDFB";
const HAIRLINE = "#E3E3DD";
const FEDERAL = "#3B5B85";
const AMBER = "#B4862E";
const RED = "#B04C3E";

const SANS = "'Public Sans','Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'Overpass Mono','SFMono-Regular',Menlo,Consolas,monospace";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${REGISTER};color:${INK};font-family:${SANS};font-size:16px;line-height:1.55;">
<div style="max-width:600px;margin:0 auto;padding:24px 20px 40px;">
<div style="font-family:${MONO};font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${INK_3};">RFPRadar</div>
${body}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid ${HAIRLINE};font-size:13px;color:${INK_3};">
You are receiving this because your firm has a seat on RFPRadar. Change the scan hour, threshold, or Slack destination in Settings.
</div>
</div></body></html>`;
}

/* ------------------------------------------------------------- reminders */

export interface ReminderContext {
  firmName: string;
  kindLabel: string;
  label: string;
  dueText: string;
  countdown: string;
  offset: number;
  url: string;
}

/**
 * "in 7 days" but "tomorrow", not "in tomorrow". `formatCountdown` returns both
 * shapes, and gluing "in " onto all of them reads like a machine wrote it.
 */
export function countdownPhrase(countdown: string): string {
  return /^\d/.test(countdown) ? `in ${countdown}` : countdown;
}

export function reminderEmail(context: ReminderContext): {
  subject: string;
  html: string;
  text: string;
} {
  const tone = context.offset <= 1 ? RED : context.offset <= 3 ? AMBER : INK;
  const phrase = countdownPhrase(context.countdown);
  const subject = `${context.kindLabel} ${phrase} — ${context.label}`;
  const html = shell(
    subject,
    `<h1 style="font-size:22px;line-height:1.2;letter-spacing:-0.01em;font-weight:600;margin:16px 0 8px;">${escapeHtml(context.kindLabel)} ${escapeHtml(phrase)}</h1>
<p style="margin:0 0 16px;color:${INK_2};font-size:13px;">T-${context.offset} reminder for ${escapeHtml(context.firmName)}.</p>
<div style="background:${CARD};border:1px solid ${HAIRLINE};border-radius:12px;padding:16px;">
  <div style="font-weight:600;font-size:16px;line-height:1.3;">${escapeHtml(context.label)}</div>
  <div style="font-family:${MONO};font-size:13px;margin-top:8px;color:${tone};">${escapeHtml(context.dueText)} · ${escapeHtml(context.countdown)}</div>
</div>
<p style="margin:20px 0 0;"><a href="${escapeHtml(context.url)}" style="display:inline-block;background:${INK};color:${REGISTER};text-decoration:none;padding:14px 20px;border-radius:8px;font-weight:600;font-size:15px;">Open the pursuit</a></p>`,
  );
  const text = `${context.kindLabel} ${phrase} (T-${context.offset})\n\n${context.label}\nDue ${context.dueText}\n\n${context.url}\n`;
  return { subject, html, text };
}

export function reminderSlack(context: ReminderContext): Record<string, unknown> {
  return {
    text: `${context.kindLabel} ${countdownPhrase(context.countdown)}: ${context.label}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${context.kindLabel} ${countdownPhrase(context.countdown)}* (T-${context.offset})\n<${context.url}|${context.label}>\n\`${context.dueText}\``,
        },
      },
    ],
  };
}

/* ------------------------------------------------------------ morning scan */

export interface ScanMatchLine {
  score: number;
  title: string;
  agency: string;
  noticeId: string;
  dueText: string | null;
  countdown: string | null;
  valueBand: string | null;
  reasons: string[];
  url: string;
}

export interface ScanDateChangeLine {
  title: string;
  detail: string;
  url: string;
}

export interface ScanExpiringLine {
  title: string;
  stage: string;
  dueText: string;
  countdown: string;
  url: string;
}

export interface ScanSourceLine {
  name: string;
  status: "ok" | "degraded" | "down";
  lastSuccess: string;
  note: string | null;
}

export interface ScanContext {
  firmName: string;
  dateLine: string;
  scannedCount: number;
  sourceCount: number;
  quiet: boolean;
  newMatches: ScanMatchLine[];
  dateChanges: ScanDateChangeLine[];
  expiring: ScanExpiringLine[];
  sources: ScanSourceLine[];
  appUrl: string;
}

const STATUS_COLORS: Record<ScanSourceLine["status"], string> = {
  ok: "#3D855E",
  degraded: AMBER,
  down: RED,
};

export function scanEmail(context: ScanContext): { subject: string; html: string; text: string } {
  const subject = context.quiet
    ? `No new matches — ${context.scannedCount.toLocaleString("en-US")} notices scanned`
    : context.newMatches.length === 1
      ? `1 new match — ${context.newMatches[0].title}`
      : `${context.newMatches.length} new matches — top fit ${context.newMatches[0]?.score ?? 0}`;

  const stamp = `SCANNED ${context.scannedCount.toLocaleString("en-US")} NOTICES · ${context.sourceCount} SOURCE${context.sourceCount === 1 ? "" : "S"} · ${context.dateLine}`;

  const matchBlocks = context.newMatches
    .map(
      (match) => `<div style="background:${CARD};border:1px solid ${HAIRLINE};border-radius:12px;padding:16px;margin-bottom:12px;">
  <div style="font-family:${MONO};font-size:24px;font-weight:500;color:${FEDERAL};float:right;">${match.score}</div>
  <div style="font-weight:600;font-size:16px;line-height:1.3;margin-right:44px;"><a href="${escapeHtml(match.url)}" style="color:${INK};text-decoration:none;">${escapeHtml(match.title)}</a></div>
  <div style="font-size:13px;color:${INK_2};margin-top:4px;">${escapeHtml(match.agency)}</div>
  <div style="font-family:${MONO};font-size:13px;color:${INK_3};margin-top:8px;">${escapeHtml(
    [match.noticeId, match.dueText ? `due ${match.dueText}` : null, match.countdown, match.valueBand]
      .filter(Boolean)
      .join(" · "),
  )}</div>
  <ul style="margin:12px 0 0;padding-left:18px;font-size:13px;color:${INK_2};">
    ${match.reasons.map((reason) => `<li style="margin-bottom:4px;">${escapeHtml(reason)}</li>`).join("")}
  </ul>
</div>`,
    )
    .join("");

  const quietLine = `<div style="background:${CARD};border:1px solid ${HAIRLINE};border-radius:12px;padding:16px;font-size:16px;">
  No new matches. ${context.scannedCount.toLocaleString("en-US")} notices scanned across ${context.sourceCount} source${context.sourceCount === 1 ? "" : "s"}.
</div>`;

  const dateChangeBlock = context.dateChanges.length
    ? section(
        "Dates changed",
        context.dateChanges
          .map(
            (change) =>
              `<div style="padding:12px 0;border-bottom:1px solid ${HAIRLINE};"><a href="${escapeHtml(change.url)}" style="color:${INK};text-decoration:none;font-weight:600;">${escapeHtml(change.title)}</a><div style="font-family:${MONO};font-size:13px;color:${AMBER};margin-top:4px;">${escapeHtml(change.detail)}</div></div>`,
          )
          .join(""),
      )
    : "";

  const expiringBlock = context.expiring.length
    ? section(
        "Pursuits closing within 7 days",
        context.expiring
          .map(
            (item) =>
              `<div style="padding:12px 0;border-bottom:1px solid ${HAIRLINE};"><a href="${escapeHtml(item.url)}" style="color:${INK};text-decoration:none;font-weight:600;">${escapeHtml(item.title)}</a><div style="font-family:${MONO};font-size:13px;color:${INK_2};margin-top:4px;">${escapeHtml(item.stage)} · ${escapeHtml(item.dueText)} · ${escapeHtml(item.countdown)}</div></div>`,
          )
          .join(""),
      )
    : "";

  const sourceBlock = section(
    "Source health",
    context.sources
      .map(
        (source) =>
          `<div style="padding:10px 0;border-bottom:1px solid ${HAIRLINE};">
  <span style="font-weight:600;">${escapeHtml(source.name)}</span>
  <span style="font-family:${MONO};font-size:13px;color:${INK_3};"> — last success ${escapeHtml(source.lastSuccess)}</span>
  <span style="font-family:${MONO};font-size:11px;letter-spacing:0.08em;color:${STATUS_COLORS[source.status]};"> ${source.status.toUpperCase()}</span>
  ${source.note ? `<div style="font-size:13px;color:${INK_2};margin-top:4px;">${escapeHtml(source.note)}</div>` : ""}
</div>`,
      )
      .join(""),
  );

  const html = shell(
    subject,
    `<div style="font-family:${MONO};font-size:13px;color:${INK_3};margin-top:12px;">${escapeHtml(stamp)}</div>
<h1 style="font-size:22px;line-height:1.2;letter-spacing:-0.01em;font-weight:600;margin:12px 0 16px;">${
      context.quiet
        ? "This morning's register is clear."
        : `${context.newMatches.length} match${context.newMatches.length === 1 ? "" : "es"} worth reading`
    }</h1>
${context.quiet ? quietLine : matchBlocks}
${dateChangeBlock}${expiringBlock}${sourceBlock}
<p style="margin:24px 0 0;"><a href="${escapeHtml(context.appUrl)}/radar" style="display:inline-block;background:${INK};color:${REGISTER};text-decoration:none;padding:14px 20px;border-radius:8px;font-weight:600;font-size:15px;">Open the radar</a></p>`,
  );

  const text = [
    stamp,
    "",
    context.quiet
      ? `No new matches. ${context.scannedCount.toLocaleString("en-US")} notices scanned across ${context.sourceCount} sources.`
      : context.newMatches
          .map(
            (match) =>
              `[${match.score}] ${match.title}\n  ${match.agency}\n  ${[match.noticeId, match.dueText ? `due ${match.dueText}` : null, match.valueBand].filter(Boolean).join(" · ")}\n${match.reasons.map((r) => `  - ${r}`).join("\n")}\n  ${match.url}`,
          )
          .join("\n\n"),
    context.dateChanges.length
      ? `\nDates changed:\n${context.dateChanges.map((c) => `  - ${c.title}: ${c.detail}`).join("\n")}`
      : "",
    context.expiring.length
      ? `\nPursuits closing within 7 days:\n${context.expiring.map((e) => `  - ${e.title} (${e.stage}) ${e.dueText} · ${e.countdown}`).join("\n")}`
      : "",
    `\nSource health:\n${context.sources.map((s) => `  - ${s.name}: ${s.status.toUpperCase()}, last success ${s.lastSuccess}${s.note ? ` — ${s.note}` : ""}`).join("\n")}`,
    "",
    `${context.appUrl}/radar`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

function section(title: string, inner: string): string {
  return `<div style="margin-top:24px;">
  <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${INK_3};margin-bottom:8px;">${escapeHtml(title)}</div>
  ${inner}
</div>`;
}

export function scanSlack(context: ScanContext): Record<string, unknown> {
  const stamp = `SCANNED ${context.scannedCount.toLocaleString("en-US")} NOTICES · ${context.sourceCount} SOURCES · ${context.dateLine}`;
  const blocks: Array<Record<string, unknown>> = [
    { type: "context", elements: [{ type: "mrkdwn", text: `\`${stamp}\`` }] },
  ];

  if (context.quiet) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*No new matches.* ${context.scannedCount.toLocaleString("en-US")} notices scanned across ${context.sourceCount} sources.`,
      },
    });
  } else {
    for (const match of context.newMatches.slice(0, 5)) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*\`${match.score}\`* <${match.url}|${match.title}>\n${match.agency}\n\`${[match.noticeId, match.dueText ? `due ${match.dueText}` : null, match.valueBand].filter(Boolean).join(" · ")}\`\n${match.reasons.map((reason) => `• ${reason}`).join("\n")}`,
        },
      });
    }
  }

  const unhealthy = context.sources.filter((source) => source.status !== "ok");
  if (unhealthy.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Source health*\n${unhealthy.map((s) => `• ${s.name} — ${s.status.toUpperCase()}, last success ${s.lastSuccess}${s.note ? `: ${s.note}` : ""}`).join("\n")}`,
      },
    });
  }

  return {
    text: context.quiet
      ? `No new matches. ${context.scannedCount.toLocaleString("en-US")} notices scanned.`
      : `${context.newMatches.length} new matches on RFPRadar`,
    blocks,
  };
}

/* ----------------------------------------------------------------- invites */

export function inviteEmail(context: {
  firmName: string;
  inviterName: string;
  acceptUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `${context.inviterName} added you to ${context.firmName} on RFPRadar`;
  const html = shell(
    subject,
    `<h1 style="font-size:22px;line-height:1.2;font-weight:600;margin:16px 0 8px;">You have a seat on ${escapeHtml(context.firmName)}</h1>
<p style="margin:0 0 20px;color:${INK_2};">${escapeHtml(context.inviterName)} invited you to the firm's capture desk: scored tenders every morning, the deadline calendar, and the answer library.</p>
<p style="margin:0;"><a href="${escapeHtml(context.acceptUrl)}" style="display:inline-block;background:${INK};color:${REGISTER};text-decoration:none;padding:14px 20px;border-radius:8px;font-weight:600;font-size:15px;">Set your password</a></p>
<p style="margin:16px 0 0;font-size:13px;color:${INK_3};">This link is single-use. If you weren't expecting it, ignore this email.</p>`,
  );
  const text = `${context.inviterName} invited you to ${context.firmName} on RFPRadar.\n\nSet your password: ${context.acceptUrl}\n`;
  return { subject, html, text };
}
