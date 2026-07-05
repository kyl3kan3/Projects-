/**
 * Recall.ai bot layer, abstracted behind an interface (README risk #2:
 * single-vendor dependency — keep the swap cheap). The worker never talks
 * to Recall directly; it goes through this module.
 */

import { env } from "@/lib/env";

const BASE = "https://us-west-2.recall.ai/api/v1";

export interface ScheduledBot {
  recallBotId: string;
  status: string;
}

export interface RecallRecording {
  recordingUrl: string;
  mediaExpiresAt: Date | null;
  durationSeconds: number | null;
}

async function recall<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${env.recallApiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Recall ${path} ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function scheduleBot(joinUrl: string, joinAt: Date, botName = "Briefcast Notetaker"): Promise<ScheduledBot> {
  if (env.dryRun) return { recallBotId: `dry_${Date.now()}`, status: "scheduled" };
  const data = await recall<{ id: string; status_changes: { code: string }[] }>("/bot", {
    method: "POST",
    body: JSON.stringify({
      meeting_url: joinUrl,
      bot_name: botName,
      join_at: joinAt.toISOString(),
      recording_config: { transcript: { provider: { meeting_captions: {} } } },
    }),
  });
  return { recallBotId: data.id, status: "scheduled" };
}

export async function getRecording(recallBotId: string): Promise<RecallRecording> {
  const data = await recall<{
    recordings: { media_shortcuts?: { video_mixed?: { data?: { download_url?: string } } }; expires_at?: string }[];
  }>(`/bot/${recallBotId}`);
  const rec = data.recordings?.[0];
  return {
    recordingUrl: rec?.media_shortcuts?.video_mixed?.data?.download_url ?? "",
    mediaExpiresAt: rec?.expires_at ? new Date(rec.expires_at) : null,
    durationSeconds: null,
  };
}

/** Map a Recall webhook status code to our bot status enum. */
export function mapBotStatus(code: string): "scheduled" | "joining" | "in_call" | "done" | "failed" {
  if (["joining_call", "in_waiting_room"].includes(code)) return "joining";
  if (["in_call_recording", "in_call_not_recording"].includes(code)) return "in_call";
  if (["done", "recording_done", "call_ended"].includes(code)) return "done";
  if (["fatal", "error", "not_admitted"].includes(code)) return "failed";
  return "scheduled";
}
