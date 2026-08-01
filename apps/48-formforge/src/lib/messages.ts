/**
 * src/lib/messages.ts
 *
 * Every outbound message body, in one file, built from exactly three inputs:
 * the patient's **first name**, the **practice name**, and the **link**.
 *
 * That is not a style preference. Transactional email and SMS sit outside the
 * PHI boundary in this architecture (ARCHITECTURE.md: "the packet lives behind
 * the link"), and that claim is only true if the messages stay this thin. So the
 * template functions cannot see a patient row — they take three strings — and
 * `messages.test.ts` feeds them a patient whose surname, email, date of birth
 * and diagnosis are distinctive and asserts none of it appears in the output.
 *
 * A last name is deliberately excluded too: "Hi Dana" plus a clinic name is a
 * far weaker disclosure to a shared inbox than "Hi Dana Okonkwo".
 */

export interface MessageInputs {
  firstName: string;
  practiceName: string;
  url: string;
}

export interface EmailMessage {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrap(bodyLines: string[], url: string, cta: string): string {
  const paragraphs = bodyLines
    .map((line) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#1D2628">${escapeHtml(line)}</p>`)
    .join("");
  return [
    `<div style="background:#F7F6F1;padding:24px;font-family:-apple-system,Segoe UI,sans-serif">`,
    `<div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E4E1D6;border-radius:12px;padding:24px">`,
    paragraphs,
    `<p style="margin:24px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1D2628;color:#F7F6F1;text-decoration:none;padding:14px 20px;border-radius:8px;font-weight:600;font-size:15px">${escapeHtml(cta)}</a></p>`,
    `<p style="margin:20px 0 0;font-size:13px;line-height:1.45;color:#95A0A0">This link is private to you. If you were not expecting it, you can ignore this message.</p>`,
    `</div></div>`,
  ].join("");
}

/** The first send. */
export function intakeInviteEmail(m: MessageInputs): EmailMessage {
  const lines = [
    `Hi ${m.firstName},`,
    `${m.practiceName} has sent you a few forms to fill in before your first appointment.`,
    `It takes about ten minutes, it works on your phone, and it saves as you go — you can stop and come back to the same link.`,
  ];
  return {
    subject: `Your forms from ${m.practiceName}`,
    text: `${lines.join("\n\n")}\n\n${m.url}\n\nThis link is private to you. If you were not expecting it, you can ignore this message.\n`,
    html: wrap(lines, m.url, "Open my forms"),
  };
}

/** A reminder. Same three inputs, different framing. */
export function intakeReminderEmail(m: MessageInputs): EmailMessage {
  const lines = [
    `Hi ${m.firstName},`,
    `A reminder that ${m.practiceName} is still waiting on your forms.`,
    `Your answers so far are saved — the link picks up where you left off.`,
  ];
  return {
    subject: `Reminder: your forms from ${m.practiceName}`,
    text: `${lines.join("\n\n")}\n\n${m.url}\n\nThis link is private to you. If you were not expecting it, you can ignore this message.\n`,
    html: wrap(lines, m.url, "Finish my forms"),
  };
}

/** SMS. 160 characters is the budget; name + practice + link is all that fits anyway. */
export function intakeReminderSms(m: MessageInputs): string {
  return `Hi ${m.firstName}, ${m.practiceName} is still waiting on your intake forms: ${m.url} Reply STOP to opt out.`;
}

/** The staff-side notification. No PHI: a first name and a link to the packet. */
export function clinicianNotificationEmail(input: {
  clinicianName: string;
  patientFirstName: string;
  practiceName: string;
  dashboardUrl: string;
  riskFlag: boolean;
}): EmailMessage {
  const lines = [
    `${input.clinicianName},`,
    input.riskFlag
      ? `${input.patientFirstName} has completed their intake packet, and a screener item that needs your attention was answered above zero. Open the packet in FormForge to review it.`
      : `${input.patientFirstName} has completed and signed their intake packet. It is ready to review in FormForge.`,
  ];
  return {
    subject: input.riskFlag
      ? `Review needed: ${input.patientFirstName}'s intake`
      : `${input.patientFirstName} completed their intake`,
    text: `${lines.join("\n\n")}\n\n${input.dashboardUrl}\n`,
    html: wrap(lines, input.dashboardUrl, "Open the packet"),
  };
}

/** The patient link, built from the raw token. The token never gets persisted. */
export function intakeUrl(appUrl: string, rawToken: string): string {
  return `${appUrl.replace(/\/$/, "")}/intake/${rawToken}`;
}
