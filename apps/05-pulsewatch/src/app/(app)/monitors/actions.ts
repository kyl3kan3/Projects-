"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  createMonitor,
  deleteMonitor,
  pauseMonitor,
  PlanLimitError,
  recheckNow,
  ValidationError,
} from "@/lib/monitors";
import type { MonitorType, ScheduleKind } from "@/db/schema";

export interface MonitorFormState {
  error?: string;
}

function num(form: FormData, key: string): number | undefined {
  const raw = form.get(key);
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse "200, 201, 204" or "200-204" into a concrete list. */
function statusCodes(raw: string): number[] {
  const out = new Set<number>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const range = trimmed.match(/^(\d{3})\s*-\s*(\d{3})$/);
    if (range) {
      for (let c = Number(range[1]); c <= Number(range[2]); c++) out.add(c);
    } else if (/^\d{3}$/.test(trimmed)) {
      out.add(Number(trimmed));
    }
  }
  return [...out];
}

/** Parse "X-Api-Key: abc" lines into a header map. */
function headers(raw: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && value) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

export async function createMonitorAction(
  _prev: MonitorFormState,
  form: FormData,
): Promise<MonitorFormState> {
  const { team } = await requireUser();
  const type = String(form.get("type") ?? "http") as MonitorType;

  let monitorId: string;
  try {
    const monitor = await createMonitor({
      teamId: team.id,
      planId: team.plan,
      name: String(form.get("name") ?? ""),
      type,
      target: String(form.get("target") ?? ""),
      intervalSeconds: num(form, "intervalSeconds"),
      regions: form.getAll("regions").map(String),
      expectedStatusCodes: statusCodes(String(form.get("expectedStatusCodes") ?? "")),
      keyword: String(form.get("keyword") ?? "") || null,
      keywordInvert: form.get("keywordInvert") === "on",
      followRedirects: form.get("followRedirects") !== "off",
      requestHeaders: headers(String(form.get("requestHeaders") ?? "")),
      timeoutMs: num(form, "timeoutMs"),
      failureThreshold: num(form, "failureThreshold"),
      scheduleKind: (String(form.get("scheduleKind") ?? "interval") as ScheduleKind),
      expectedIntervalSeconds: num(form, "expectedIntervalSeconds") ?? null,
      cronExpression: String(form.get("cronExpression") ?? "") || null,
      graceSeconds: num(form, "graceSeconds"),
    });
    monitorId = monitor.id;
  } catch (err) {
    if (err instanceof PlanLimitError || err instanceof ValidationError) {
      return { error: err.message };
    }
    console.error("[monitors] create failed", err);
    return { error: "Could not create that monitor" };
  }

  revalidatePath("/dashboard");
  redirect(`/monitors/${monitorId}`);
}

export async function pauseMonitorAction(formData: FormData): Promise<void> {
  const { team } = await requireUser();
  const id = String(formData.get("id"));
  await pauseMonitor(id, team.id, formData.get("paused") === "true");
  revalidatePath("/dashboard");
  revalidatePath(`/monitors/${id}`);
}

export async function recheckMonitorAction(formData: FormData): Promise<void> {
  const { team } = await requireUser();
  const id = String(formData.get("id"));
  await recheckNow(id, team.id);
  revalidatePath(`/monitors/${id}`);
}

export async function deleteMonitorAction(formData: FormData): Promise<void> {
  const { team } = await requireUser();
  await deleteMonitor(String(formData.get("id")), team.id);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
