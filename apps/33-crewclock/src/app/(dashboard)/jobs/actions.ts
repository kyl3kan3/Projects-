"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { auditLog, jobSites, jobs, type JobStatus } from "@/db/schema";
import { requireOffice } from "@/lib/auth";
import { assignCrew, setJobStatus, unassignCrew } from "@/lib/jobs";
import { planAllows } from "@/lib/plans";

/** Hours arrive as a decimal from the bid sheet; they are stored as minutes. */
function parseBidMinutes(raw: string): number | null {
  const value = Number(raw);
  if (!raw.trim() || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 60);
}

/** Dollars in, integer cents stored. Never a float in the database. */
function parseCents(raw: string): number | null {
  const value = Number(raw.replace(/[$,]/g, ""));
  if (!raw.trim() || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export async function createJobAction(formData: FormData): Promise<void> {
  const { user, org } = await requireOffice();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/jobs/new?error=name");

  const siteId = String(formData.get("jobSiteId") ?? "").trim();
  // Bids are a Company-plan feature; a Crew-plan org simply has no budget on
  // the job, and the cost bar says "no labor budget" rather than lying.
  const canBid = planAllows(org.plan, "bids");

  const db = getDb();
  const [job] = await db
    .insert(jobs)
    .values({
      organizationId: org.id,
      jobSiteId: siteId || null,
      name,
      clientName: String(formData.get("clientName") ?? "").trim(),
      bidLaborMinutes: canBid ? parseBidMinutes(String(formData.get("bidHours") ?? "")) : null,
      bidLaborCostCents: canBid ? parseCents(String(formData.get("bidDollars") ?? "")) : null,
      status: "active",
      startedAt: new Date(),
    })
    .returning();

  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: user.id,
    action: "job.create",
    target: job.id,
    metadata: { name },
  });

  revalidatePath("/jobs");
  redirect(`/jobs/${job.id}`);
}

export async function createSiteAction(formData: FormData): Promise<void> {
  const { user, org } = await requireOffice();
  const label = String(formData.get("label") ?? "").trim();
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const radiusM = Math.round(Number(formData.get("radiusM") ?? 150));

  if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    redirect("/sites?error=coords");
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) redirect("/sites?error=coords");

  const db = getDb();
  const [site] = await db
    .insert(jobSites)
    .values({
      organizationId: org.id,
      label,
      address: String(formData.get("address") ?? "").trim(),
      lat,
      lng,
      radiusM: Number.isFinite(radiusM) && radiusM >= 25 ? Math.min(radiusM, 5000) : 150,
    })
    .returning();

  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: user.id,
    action: "job_site.create",
    target: site.id,
    metadata: { label, radiusM: site.radiusM },
  });

  revalidatePath("/sites");
  redirect("/sites?saved=1");
}

export async function assignCrewAction(formData: FormData): Promise<void> {
  await requireOffice();
  const jobId = String(formData.get("jobId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const assigned = String(formData.get("assigned") ?? "") === "1";
  if (!jobId || !userId) return;
  if (assigned) await unassignCrew(jobId, userId);
  else await assignCrew(jobId, userId);
  revalidatePath(`/jobs/${jobId}`);
}

export async function setJobStatusAction(formData: FormData): Promise<void> {
  const { org } = await requireOffice();
  const jobId = String(formData.get("jobId") ?? "");
  const status = String(formData.get("status") ?? "") as JobStatus;
  if (!jobId || !["bidding", "active", "complete", "archived"].includes(status)) return;
  await setJobStatus(org.id, jobId, status);
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
}
