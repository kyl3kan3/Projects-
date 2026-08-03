"use server";

import { revalidatePath } from "next/cache";
import { intakeCertificate, parseCertificate, validatePdf } from "@/lib/certificates";
import { enqueue, QUEUES } from "@/lib/queue";
import { vendorForToken } from "@/lib/tokens";
import { engagementViews } from "@/lib/verdicts";
import { getDb } from "@/db";
import { orgs } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Deficiency } from "@/db/schema";

/**
 * The one action a vendor can take. It is a public endpoint by design — the token in
 * the URL is the credential — so it does exactly one thing and does it for exactly
 * one vendor.
 */

export interface UploadState {
  error: string | null;
  /** What happened, in the vendor's language. */
  status: "idle" | "received" | "under_review" | "accepted" | "deficient" | "unreadable";
  message: string | null;
  deficiencies: Deficiency[];
}

/**
 * The idle state, module-private. It is deliberately NOT exported: a `"use server"`
 * module may only export async functions, and a plain object exported from one
 * arrives as `undefined` across the boundary — which crashed the portal with
 * "Cannot read properties of undefined" until it was moved into the client
 * component. The client declares its own copy.
 */
const IDLE: UploadState = {
  error: null,
  status: "idle",
  message: null,
  deficiencies: [],
};

export async function uploadCertificateAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const token = String(formData.get("token") ?? "");
  const file = formData.get("file");

  const vendor = await vendorForToken(token);
  if (!vendor) {
    return {
      ...IDLE,
      error:
        "This upload link is no longer valid. Ask your contact for a new one — the most recent renewal email always has a working link.",
    };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { ...IDLE, error: "Choose the certificate PDF to upload." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const invalid = validatePdf(bytes, file.name);
  if (invalid) return { ...IDLE, error: invalid };

  const intake = await intakeCertificate({
    orgId: vendor.orgId,
    vendorId: vendor.id,
    bytes,
    source: "portal",
    actor: `${vendor.name} (upload portal)`,
    filename: file.name,
  });

  if (intake.duplicate) {
    return {
      error: null,
      status: "received",
      message:
        "We already have this exact file on record, so nothing changed. If your policy has renewed, the certificate your agent sends will be a different document — upload that one.",
      deficiencies: [],
    };
  }

  // Parse now when there is no worker, so the vendor sees a real answer rather than
  // a spinner that never resolves.
  const queued = await enqueue(
    QUEUES.parseCertificate,
    { certificateId: intake.certificateId },
    { jobId: `parse:${intake.certificateId}` },
  );
  const outcome = queued ? null : await parseCertificate(intake.certificateId);
  revalidatePath(`/v/${token}`);

  if (!outcome || outcome.status === "pending") {
    return {
      error: null,
      status: "received",
      message:
        "Received. We are reading the certificate now — you do not need to do anything else, and your contact will see it within a few minutes.",
      deficiencies: [],
    };
  }

  if (outcome.status === "failed") {
    return {
      error: null,
      status: "unreadable",
      message: `Received, and it is safely on file — but we could not read it automatically. ${outcome.error ?? ""} Someone will enter it by hand, so there is nothing more for you to do.`,
      deficiencies: [],
    };
  }

  if (outcome.status === "needs_review") {
    return {
      error: null,
      status: "under_review",
      message:
        "Received. A few fields were not clear enough for us to accept automatically, so your certificate is under review by a person. Nothing more is needed from you right now.",
      deficiencies: [],
    };
  }

  // Parsed and in compliance: tell them the verdict, including the bad news.
  const db = getDb();
  const [org] = await db.select().from(orgs).where(eq(orgs.id, vendor.orgId));
  const views = org ? await engagementViews(org, { vendorId: vendor.id }) : [];
  const failing = views.filter(
    (v) => v.verdict.status !== "compliant" && v.verdict.status !== "expiring",
  );

  if (failing.length) {
    const seen = new Set<string>();
    const deficiencies = failing
      .flatMap((v) => v.verdict.deficiencies)
      .filter((d) => (seen.has(d.reason) ? false : (seen.add(d.reason), true)));
    return {
      error: null,
      status: "deficient",
      message:
        "Received and read — thank you. It does not yet meet the insurance requirement in the contract, for the reasons below. Ask your agent to reissue it with these corrected and upload the new one here.",
      deficiencies,
    };
  }

  return {
    error: null,
    status: "accepted",
    message:
      "Received, read, and it meets the requirement. Nothing further is needed. We will ask again about 30 days before it expires.",
    deficiencies: [],
  };
}
