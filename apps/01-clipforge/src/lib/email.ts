/**
 * Transactional email via Resend. No-ops (logs) when RESEND_API_KEY is unset,
 * so local/dev pipelines don't fail on email.
 */

import { Resend } from "resend";
import { env, has } from "@/lib/env";

let _resend: Resend | null = null;
function resend(): Resend | null {
  if (!has("RESEND_API_KEY")) return null;
  if (!_resend) _resend = new Resend(env.resendApiKey);
  return _resend;
}

export async function sendReadyEmail(opts: {
  to: string;
  projectTitle: string;
  projectId: string;
}): Promise<void> {
  const client = resend();
  const url = `${env.appUrl}/projects/${opts.projectId}`;
  if (!client) {
    console.log(`[email] (skipped) content kit ready for "${opts.projectTitle}" → ${url}`);
    return;
  }
  await client.emails.send({
    from: env.emailFrom,
    to: opts.to,
    subject: `Your content kit for "${opts.projectTitle}" is ready`,
    html: `<div style="font-family:sans-serif">
      <h2>Your content kit is ready 🎬</h2>
      <p>ClipForge finished processing <strong>${escapeHtml(opts.projectTitle)}</strong>.</p>
      <p>Clips, a tweet thread, LinkedIn posts, and a newsletter draft are waiting.</p>
      <p><a href="${url}" style="background:#6d5efc;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Open your kit</a></p>
    </div>`,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
