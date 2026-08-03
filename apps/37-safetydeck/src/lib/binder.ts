/**
 * The inspection binder: one button, one dated PDF bundle with everything an
 * inspector or a GC prequal asks for.
 *
 * Sections, in the order they are asked for:
 *
 *  1. Manifest cover — who, what range, when, and what is inside.
 *  2. Toolbox-talk attendance, one page per huddle, with the actual signatures
 *     drawn from the stored stroke paths and both timestamps.
 *  3. The Form 300 log for each year the range touches.
 *  4. The latest 300A for the most recent complete year in range.
 *  5. The cert matrix, grouped by employee.
 *  6. The incident list, including the non-recordable first-aid cases — an
 *     inspector who asks "and what did you decide not to record?" gets an answer.
 *
 * Re-exporting always produces a new artifact. A binder handed to an inspector
 * has to stay reproducible, so nothing ever mutates an old one.
 */

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLog,
  binderExports,
  certs,
  companies,
  crews,
  employees,
  signOffs,
  talkInstances,
  talks,
  type BinderManifest,
  type Company,
} from "@/db/schema";
import { certKindLabel, deriveStatus, expiryLabel } from "@/lib/certs";
import { monthDay, monthDayYear, todayIso, year as yearOf, type IsoDate } from "@/lib/dates";
import {
  denominatorsFor,
  listIncidents,
  summarise300A,
  type IncidentWithEmployee,
} from "@/lib/incident-store";
import { mergePdfs, render300, render300A } from "@/lib/osha-forms";
import {
  createDoc,
  drawFooter,
  drawSignature,
  drawText,
  hairline,
  INK,
  LETTER_PORTRAIT,
  MUTED,
  box,
  type Doc,
} from "@/lib/pdf";
import { newObjectKey, putObject } from "@/lib/storage";
import { FORM_LOGIC_VERSION } from "@/lib/incidents";

const MARGIN = 46;

export interface BinderResult {
  id: string;
  storageKey: string;
  pageCount: number;
  manifest: BinderManifest;
}

export async function assembleBinder(
  companyId: string,
  rangeStart: IsoDate,
  rangeEnd: IsoDate,
  requestedBy: string,
): Promise<BinderResult> {
  const db = getDb();
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) throw new Error("No such company");

  /* ---- gather ---- */

  const instanceRows = await db
    .select({ instance: talkInstances, crew: crews, talk: talks })
    .from(talkInstances)
    .innerJoin(crews, eq(crews.id, talkInstances.crewId))
    .innerJoin(talks, eq(talks.id, talkInstances.talkId))
    .where(
      and(
        eq(talkInstances.companyId, companyId),
        gte(talkInstances.scheduledFor, rangeStart),
        lte(talkInstances.scheduledFor, rangeEnd),
      ),
    )
    .orderBy(asc(talkInstances.scheduledFor));

  const instanceIds = instanceRows.map((r) => r.instance.id);
  const sigRows = instanceIds.length
    ? await db
        .select({ sig: signOffs, employee: employees })
        .from(signOffs)
        .innerJoin(employees, eq(employees.id, signOffs.employeeId))
        .where(inArray(signOffs.talkInstanceId, instanceIds))
        .orderBy(asc(signOffs.signedAt))
    : [];

  const staff = await db
    .select({ employee: employees, crewName: crews.name })
    .from(employees)
    .leftJoin(crews, eq(crews.id, employees.crewId))
    .where(eq(employees.companyId, companyId))
    .orderBy(asc(employees.name));

  const certRows = await db
    .select()
    .from(certs)
    .where(eq(certs.companyId, companyId))
    .orderBy(asc(certs.expiresOn));

  const incidents = await listIncidents(companyId, { from: rangeStart, to: rangeEnd });

  const years = Array.from(
    new Set([yearOf(rangeStart), yearOf(rangeEnd), ...incidents.map((i) => i.incident.year)]),
  ).sort();

  /* ---- render ---- */

  const parts: Uint8Array[] = [];
  const sections: BinderManifest["sections"] = [];

  const attendance = await renderAttendanceSection(company, instanceRows, sigRows, rangeStart, rangeEnd);
  const logs: Uint8Array[] = [];
  for (const y of years) {
    const cases = incidents.filter((i) => i.incident.year === y);
    logs.push(await render300({ company, year: y, cases }));
  }
  const summaryYear = years[years.length - 1];
  const summaryCases = incidents.filter((i) => i.incident.year === summaryYear);
  const denominators = await denominatorsFor(companyId, summaryYear);
  const summary = summarise300A(summaryYear, summaryCases, denominators);
  const form300A = await render300A({
    company,
    summary,
    certifiedBy: {
      name: denominators.certifiedByName,
      title: denominators.certifiedByTitle,
      phone: denominators.certifiedByPhone,
      at: denominators.certifiedAt,
    },
  });
  const certMatrix = await renderCertMatrix(company, staff, certRows, rangeEnd);
  const incidentList = await renderIncidentList(company, incidents, rangeStart, rangeEnd);

  sections.push({
    title: "Toolbox-talk attendance",
    detail: `${instanceRows.length} huddle${instanceRows.length === 1 ? "" : "s"}, ${sigRows.length} signature${sigRows.length === 1 ? "" : "s"}`,
  });
  sections.push({
    title: `OSHA Form 300 log${years.length > 1 ? "s" : ""}`,
    detail: years.map(String).join(", "),
  });
  sections.push({
    title: "OSHA Form 300A summary",
    detail: `${summaryYear} — ${summary.totalCases} recordable case${summary.totalCases === 1 ? "" : "s"}`,
  });
  sections.push({
    title: "Training and certification matrix",
    detail: `${staff.length} employee${staff.length === 1 ? "" : "s"}, ${certRows.length} cert${certRows.length === 1 ? "" : "s"}`,
  });
  sections.push({
    title: "Incident list",
    detail: `${incidents.length} case${incidents.length === 1 ? "" : "s"} including first-aid-only records`,
  });

  const manifest: BinderManifest = {
    sections,
    talkInstances: instanceRows.length,
    signatures: sigRows.length,
    incidents: incidents.length,
    recordableIncidents: incidents.filter((i) => i.incident.recordable).length,
    certs: certRows.length,
    employees: staff.length,
  };

  const cover = await renderCover(company, rangeStart, rangeEnd, requestedBy, manifest);
  parts.push(cover, attendance, ...logs, form300A, certMatrix, incidentList);

  const merged = await mergePdfs(parts, {
    title: `Safety records — ${establishment(company)} — ${rangeStart} to ${rangeEnd}`,
    subject: "Inspection binder: talk attendance, OSHA 300/300A, cert matrix, incident list",
  });
  const key = newObjectKey(companyId, "binder", "pdf");
  await putObject(key, merged.bytes, "application/pdf", companyId);

  const [row] = await db
    .insert(binderExports)
    .values({
      companyId,
      rangeStart,
      rangeEnd,
      storageKey: key,
      pageCount: merged.pages,
      requestedBy,
      contents: manifest,
    })
    .returning();

  await db.insert(auditLog).values({
    companyId,
    actor: requestedBy,
    action: "binder.export",
    target: row.id,
    metadata: {
      rangeStart,
      rangeEnd,
      pageCount: merged.pages,
      signatures: manifest.signatures,
      recordableIncidents: manifest.recordableIncidents,
    },
  });

  return { id: row.id, storageKey: key, pageCount: merged.pages, manifest };
}

/* ------------------------------------------------------------------ pages --- */

function establishment(company: Company): string {
  return company.establishmentName?.trim() || company.name;
}

function binderFooter(company: Company, label: string) {
  return {
    left: `${establishment(company)} · ${label} · form logic ${FORM_LOGIC_VERSION}`,
    right: `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by SafetyDeck`,
  };
}

async function renderCover(
  company: Company,
  rangeStart: IsoDate,
  rangeEnd: IsoDate,
  requestedBy: string,
  manifest: BinderManifest,
): Promise<Uint8Array> {
  const doc = await createDoc(
    `Safety records — ${establishment(company)}`,
    "Inspection binder",
  );
  const { fonts } = doc;
  const p = doc.pdf.addPage(LETTER_PORTRAIT);
  const { width } = p.getSize();
  const inner = width - MARGIN * 2;
  let y = 726;

  drawText(p, fonts, "SAFETY RECORDS", MARGIN, y, { size: 9, font: fonts.bold, color: MUTED });
  y -= 26;
  drawText(p, fonts, establishment(company), MARGIN, y, { size: 24, font: fonts.bold });
  y -= 30;
  drawText(
    p,
    fonts,
    `${monthDayYear(rangeStart)} — ${monthDayYear(rangeEnd)}`,
    MARGIN,
    y,
    { size: 13, font: fonts.monoBold },
  );
  y -= 24;
  hairline(p, MARGIN, y, inner, INK);
  y -= 22;

  drawText(
    p,
    fonts,
    "This bundle was generated from SafetyDeck's records for the range above. Each section is the record as captured: signatures are the strokes taken on the phone at the huddle, and both the device time and the server sync time are printed beside them.",
    MARGIN,
    y,
    { size: 9.5, maxWidth: inner },
  );
  y -= 52;

  drawText(p, fonts, "CONTENTS", MARGIN, y, { size: 8, font: fonts.bold, color: MUTED });
  y -= 16;
  let n = 1;
  for (const section of manifest.sections) {
    drawText(p, fonts, `${n}.`, MARGIN, y, { size: 10, font: fonts.monoBold });
    drawText(p, fonts, section.title, MARGIN + 24, y, { size: 10.5, font: fonts.bold });
    drawText(p, fonts, section.detail, MARGIN + 24, y - 13, { size: 8.6, color: MUTED });
    y -= 30;
    hairline(p, MARGIN, y + 6, inner);
    n += 1;
  }

  y -= 14;
  box(p, MARGIN, y, inner, 74);
  drawText(p, fonts, "Chain of custody", MARGIN + 10, y - 8, { size: 7.6, color: MUTED });
  drawText(p, fonts, `Requested by ${requestedBy}`, MARGIN + 10, y - 22, { size: 9.5 });
  drawText(
    p,
    fonts,
    `Generated ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`,
    MARGIN + 10,
    y - 38,
    { size: 9.5, font: fonts.mono },
  );
  drawText(
    p,
    fonts,
    "This export is logged in SafetyDeck's audit trail. Re-exporting produces a new bundle; this one is never altered.",
    MARGIN + 10,
    y - 54,
    { size: 7.6, color: MUTED, maxWidth: inner - 20 },
  );
  y -= 90;

  drawText(
    p,
    fonts,
    "SafetyDeck is recordkeeping software, not legal advice. Recordability determinations were made by the versioned 29 CFR 1904 logic noted in each footer, and the employer remains responsible for the accuracy of these records.",
    MARGIN,
    y,
    { size: 7.6, color: MUTED, maxWidth: inner },
  );

  drawFooter(p, fonts, binderFooter(company, "Cover"), MARGIN);
  return doc.pdf.save();
}

type InstanceRow = {
  instance: typeof talkInstances.$inferSelect;
  crew: typeof crews.$inferSelect;
  talk: typeof talks.$inferSelect;
};
type SigRow = { sig: typeof signOffs.$inferSelect; employee: typeof employees.$inferSelect };

async function renderAttendanceSection(
  company: Company,
  instances: InstanceRow[],
  sigs: SigRow[],
  rangeStart: IsoDate,
  rangeEnd: IsoDate,
): Promise<Uint8Array> {
  const doc = await createDoc("Toolbox-talk attendance", "Attendance records with signatures");
  if (instances.length === 0) {
    const p = doc.pdf.addPage(LETTER_PORTRAIT);
    drawText(p, doc.fonts, "Toolbox-talk attendance", MARGIN, 726, {
      size: 18,
      font: doc.fonts.bold,
    });
    drawText(
      p,
      doc.fonts,
      `No toolbox talks were scheduled between ${monthDayYear(rangeStart)} and ${monthDayYear(rangeEnd)}. A range with no huddles in it is itself a finding — an inspector reads the gap.`,
      MARGIN,
      690,
      { size: 10, maxWidth: 520 },
    );
    drawFooter(p, doc.fonts, binderFooter(company, "Attendance"), MARGIN);
    return doc.pdf.save();
  }

  for (const row of instances) {
    renderAttendancePages(
      doc,
      company,
      row,
      sigs.filter((s) => s.sig.talkInstanceId === row.instance.id),
    );
  }
  return doc.pdf.save();
}

/**
 * One huddle, one page — continued onto as many pages as the crew needs. A
 * 25-person crew does not fit on a page, and a signature that silently fell off
 * the bottom of the binder is the whole product failing quietly.
 */
function renderAttendancePages(
  doc: Doc,
  company: Company,
  row: InstanceRow,
  sigs: SigRow[],
): void {
  const { fonts } = doc;
  let index = 0;
  let part = 1;
  do {
    const p = doc.pdf.addPage(LETTER_PORTRAIT);
    const { width } = p.getSize();
    const inner = width - MARGIN * 2;
    let y = 736;

    drawText(p, fonts, "TOOLBOX TALK ATTENDANCE", MARGIN, y, {
      size: 8,
      font: fonts.bold,
      color: MUTED,
    });
    y -= 22;
    drawText(p, fonts, row.talk.title + (part > 1 ? ` (continued)` : ""), MARGIN, y, {
      size: 16,
      font: fonts.bold,
      maxWidth: inner,
    });
    y -= 24;
    drawText(
      p,
      fonts,
      `${row.crew.name}${row.crew.siteLabel ? ` · ${row.crew.siteLabel}` : ""} · foreman ${row.crew.foremanName}`,
      MARGIN,
      y,
      { size: 9.5, maxWidth: inner },
    );
    y -= 15;
    const stamp = [
      `Scheduled ${monthDayYear(row.instance.scheduledFor)}`,
      row.instance.completedAt
        ? `completed ${row.instance.completedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`
        : "not completed",
      row.instance.gpsLat !== null && row.instance.gpsLng !== null
        ? `GPS ${row.instance.gpsLat.toFixed(5)}, ${row.instance.gpsLng.toFixed(5)}`
        : "no GPS recorded",
      row.instance.syncedFromOffline ? "captured offline, synced later" : "captured online",
    ].join(" · ");
    // The stamp line wraps on a narrow page; take its measured height rather
    // than a guess, or it collides with the signature count below it.
    y -= drawText(p, fonts, stamp, MARGIN, y, {
      size: 8.4,
      font: fonts.mono,
      color: MUTED,
      maxWidth: inner,
    });
    y -= 8;
    hairline(p, MARGIN, y, inner, INK);
    y -= 8;

    drawText(
      p,
      fonts,
      `${sigs.length} signature${sigs.length === 1 ? "" : "s"} captured`,
      MARGIN,
      y,
      { size: 8, font: fonts.bold, color: MUTED },
    );
    y -= 16;

    if (sigs.length === 0) {
      drawText(
        p,
        fonts,
        "No signatures were captured for this huddle. The talk was scheduled and the record is empty — that is what it says.",
        MARGIN,
        y,
        { size: 9.5, maxWidth: inner },
      );
      y -= 24;
    }

    while (index < sigs.length && y > 130) {
      const { sig, employee } = sigs[index];
      drawText(p, fonts, employee.name, MARGIN, y, { size: 10.5, font: fonts.bold });
      drawText(p, fonts, employee.jobTitle ?? "", MARGIN, y - 13, { size: 8.4, color: MUTED });
      drawSignature(p, sig.signaturePath, {
        x: MARGIN + 180,
        yTop: y + 4,
        width: 200,
        height: 48,
        sourceWidth: sig.signatureWidth,
        sourceHeight: sig.signatureHeight,
      });
      hairline(p, MARGIN + 180, y - 46, 200, INK);
      const times = `signed ${sig.signedAt.toISOString().slice(0, 16).replace("T", " ")}Z${
        sig.capturedOffline ? " (offline)" : ""
      }\nsynced ${sig.syncedAt.toISOString().slice(0, 16).replace("T", " ")}Z`;
      drawText(p, fonts, times, MARGIN + 396, y, {
        size: 7.6,
        font: fonts.mono,
        color: MUTED,
        lineHeight: 10,
      });
      y -= 62;
      hairline(p, MARGIN, y + 6, inner);
      index += 1;
    }

    const absent = row.instance.absentEmployeeIds ?? [];
    if (index >= sigs.length && absent.length > 0 && y > 90) {
      y -= 8;
      drawText(
        p,
        fonts,
        `${absent.length} crew member${absent.length === 1 ? "" : "s"} noted absent by the foreman when the huddle was closed.`,
        MARGIN,
        y,
        { size: 8.4, color: MUTED, maxWidth: inner },
      );
    }

    drawFooter(p, fonts, binderFooter(company, "Attendance"), MARGIN);
    part += 1;
  } while (index < sigs.length);
}

type StaffRow = { employee: typeof employees.$inferSelect; crewName: string | null };

async function renderCertMatrix(
  company: Company,
  staff: StaffRow[],
  certRows: (typeof certs.$inferSelect)[],
  asOf: IsoDate,
): Promise<Uint8Array> {
  const doc = await createDoc("Training and certification matrix", "Cert matrix");
  const { fonts } = doc;
  let p = doc.pdf.addPage(LETTER_PORTRAIT);
  const { width } = p.getSize();
  const inner = width - MARGIN * 2;
  let y = 736;

  drawText(p, fonts, "TRAINING AND CERTIFICATION MATRIX", MARGIN, y, {
    size: 8,
    font: fonts.bold,
    color: MUTED,
  });
  y -= 20;
  drawText(p, fonts, `Status as of ${monthDayYear(asOf)}`, MARGIN, y, {
    size: 14,
    font: fonts.bold,
  });
  y -= 20;
  hairline(p, MARGIN, y, inner, INK);
  y -= 12;

  for (const { employee, crewName } of staff) {
    const own = certRows.filter((c) => c.employeeId === employee.id);
    const needed = 16 + own.length * 13;
    if (y - needed < 70) {
      drawFooter(p, fonts, binderFooter(company, "Cert matrix"), MARGIN);
      p = doc.pdf.addPage(LETTER_PORTRAIT);
      y = 736;
    }
    drawText(p, fonts, employee.name, MARGIN, y, { size: 10.5, font: fonts.bold });
    drawText(
      p,
      fonts,
      [employee.jobTitle, crewName, employee.active ? null : "inactive"].filter(Boolean).join(" · "),
      MARGIN + 200,
      y,
      { size: 8.4, color: MUTED, maxWidth: inner - 200 },
    );
    y -= 15;
    if (own.length === 0) {
      drawText(p, fonts, "No certifications on file", MARGIN + 12, y, {
        size: 8.4,
        color: MUTED,
      });
      y -= 13;
    }
    for (const cert of own) {
      const status = deriveStatus(cert.expiresOn, asOf);
      drawText(p, fonts, `${certKindLabel(cert.kind)} — ${cert.label}`, MARGIN + 12, y, {
        size: 8.8,
        maxWidth: 280,
      });
      drawText(p, fonts, cert.issuedOn ? `issued ${cert.issuedOn}` : "issue date not set", MARGIN + 300, y, {
        size: 8,
        font: fonts.mono,
        color: MUTED,
      });
      drawText(
        p,
        fonts,
        `${status.toUpperCase()} · ${expiryLabel(cert.expiresOn, asOf)}`,
        MARGIN + 396,
        y,
        { size: 8, font: fonts.monoBold, maxWidth: inner - 396 },
      );
      y -= 13;
    }
    y -= 6;
    hairline(p, MARGIN, y + 4, inner);
  }

  drawFooter(p, fonts, binderFooter(company, "Cert matrix"), MARGIN);
  return doc.pdf.save();
}

async function renderIncidentList(
  company: Company,
  incidents: IncidentWithEmployee[],
  rangeStart: IsoDate,
  rangeEnd: IsoDate,
): Promise<Uint8Array> {
  const doc = await createDoc("Incident list", "All logged incidents in range");
  const { fonts } = doc;
  let p = doc.pdf.addPage(LETTER_PORTRAIT);
  const { width } = p.getSize();
  const inner = width - MARGIN * 2;
  let y = 736;

  drawText(p, fonts, "INCIDENT LIST", MARGIN, y, { size: 8, font: fonts.bold, color: MUTED });
  y -= 20;
  drawText(p, fonts, `${monthDayYear(rangeStart)} — ${monthDayYear(rangeEnd)}`, MARGIN, y, {
    size: 14,
    font: fonts.bold,
  });
  y -= 16;
  drawText(
    p,
    fonts,
    "Every logged incident in the range, recordable or not. First-aid-only cases are included deliberately: the decision not to record one is part of the record.",
    MARGIN,
    y,
    { size: 8.4, color: MUTED, maxWidth: inner },
  );
  y -= 26;
  hairline(p, MARGIN, y, inner, INK);
  y -= 12;

  if (incidents.length === 0) {
    drawText(p, fonts, "No incidents were logged in this range.", MARGIN, y, { size: 10 });
  }

  for (const { incident, logName } of incidents) {
    if (y < 120) {
      drawFooter(p, fonts, binderFooter(company, "Incident list"), MARGIN);
      p = doc.pdf.addPage(LETTER_PORTRAIT);
      y = 736;
    }
    drawText(p, fonts, `${incident.year}-${String(incident.caseNumber).padStart(3, "0")}`, MARGIN, y, {
      size: 9.5,
      font: fonts.monoBold,
    });
    drawText(p, fonts, logName, MARGIN + 70, y, { size: 10, font: fonts.bold, maxWidth: 180 });
    drawText(
      p,
      fonts,
      monthDay(incident.occurredAt.toISOString().slice(0, 10)),
      MARGIN + 260,
      y,
      { size: 9, font: fonts.mono },
    );
    drawText(
      p,
      fonts,
      incident.recordable
        ? incident.needsJudgment
          ? "RECORDABLE (REVIEW)"
          : "RECORDABLE"
        : "NOT RECORDABLE",
      MARGIN + 330,
      y,
      { size: 8, font: fonts.monoBold, maxWidth: inner - 330 },
    );
    y -= 14;
    drawText(p, fonts, `${incident.injuryType} · ${incident.siteLabel}`, MARGIN + 70, y, {
      size: 8.6,
      maxWidth: inner - 70,
    });
    y -= 12;
    drawText(
      p,
      fonts,
      `${incident.recordabilityBasis.criterion} — ${incident.recordabilityBasis.citation}`,
      MARGIN + 70,
      y,
      { size: 8, color: MUTED, maxWidth: inner - 70 },
    );
    y -= 16;
    hairline(p, MARGIN, y + 6, inner);
  }

  drawFooter(p, fonts, binderFooter(company, "Incident list"), MARGIN);
  return doc.pdf.save();
}

/** Default binder range: the trailing twelve months, ending today. */
export function defaultRange(timezone: string): { start: IsoDate; end: IsoDate } {
  const end = todayIso(timezone);
  const [y, m, d] = end.split("-").map(Number);
  const start = `${y - 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { start, end };
}
