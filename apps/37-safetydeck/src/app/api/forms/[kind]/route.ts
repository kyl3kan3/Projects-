/**
 * OSHA form downloads: the 300 log, the 300A summary, and a per-incident 301.
 *
 * Generated on demand rather than served from a stored artifact, because the day
 * counts on an open case change and a stale 300 is worse than no 300. Every
 * generated form is recorded in `osha_forms` with its form-logic version and
 * logged in the audit trail — these documents end up in legal proceedings.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, oshaForms } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { todayIso, year as yearOf } from "@/lib/dates";
import {
  denominatorsFor,
  getIncident,
  listIncidents,
  summarise300A,
} from "@/lib/incident-store";
import { render300, render300A, render301 } from "@/lib/osha-forms";
import { FORM_LOGIC_VERSION } from "@/lib/incidents";
import { newObjectKey, putObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind } = await params;
  const { company, user } = await requireUser();
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year") ?? yearOf(todayIso(company.timezone)));
  const db = getDb();

  try {
    if (kind === "300") {
      const cases = await listIncidents(company.id, { year });
      const bytes = await render300({ company, year, cases });
      await record(company.id, year, "form_300", bytes, null, user.email);
      return pdf(bytes, `osha-300-${year}.pdf`);
    }

    if (kind === "300a") {
      const cases = await listIncidents(company.id, { year });
      const denominators = await denominatorsFor(company.id, year);
      const summary = summarise300A(year, cases, denominators);
      const bytes = await render300A({
        company,
        summary,
        certifiedBy: {
          name: denominators.certifiedByName,
          title: denominators.certifiedByTitle,
          phone: denominators.certifiedByPhone,
          at: denominators.certifiedAt,
        },
      });
      await record(company.id, year, "form_300a", bytes, null, user.email);
      return pdf(bytes, `osha-300a-${year}.pdf`);
    }

    if (kind === "301") {
      const incidentId = url.searchParams.get("incident") ?? "";
      const incident = await getIncident(company.id, incidentId);
      if (!incident) return new Response("not found", { status: 404 });
      const bytes = await render301({ company, incident });
      await record(
        company.id,
        incident.incident.year,
        "form_301",
        bytes,
        incident.incident.id,
        user.email,
      );
      return pdf(
        bytes,
        `osha-301-${incident.incident.year}-${String(incident.incident.caseNumber).padStart(3, "0")}.pdf`,
      );
    }

    return new Response("not found", { status: 404 });
  } catch (err) {
    // A totals mismatch throws rather than producing a wrong form. Say so
    // plainly instead of downloading something an executive would sign.
    const message = err instanceof Error ? err.message : "Could not generate that form";
    console.error("[forms] failed", err);
    return new Response(message, { status: 422, headers: { "content-type": "text/plain" } });
  }

  async function record(
    companyId: string,
    formYear: number,
    formKind: "form_300" | "form_300a" | "form_301",
    bytes: Uint8Array,
    incidentId: string | null,
    actor: string,
  ): Promise<void> {
    const key = newObjectKey(companyId, `forms/${formKind}`, "pdf");
    await putObject(key, bytes, "application/pdf", companyId);
    await db.insert(oshaForms).values({
      companyId,
      year: formYear,
      kind: formKind,
      incidentId,
      storageKey: key,
      formLogicVersion: FORM_LOGIC_VERSION,
    });
    await db.insert(auditLog).values({
      companyId,
      actor,
      action: `form.download.${formKind}`,
      target: incidentId ?? String(formYear),
      metadata: { year: formYear, bytes: bytes.byteLength },
    });
  }
}

function pdf(bytes: Uint8Array, filename: string): Response {
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
