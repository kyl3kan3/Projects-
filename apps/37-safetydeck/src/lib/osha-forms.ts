/**
 * OSHA Form 300, 301 and 300A rendering.
 *
 * The government artifact is the deliverable (README, Differentiation 2), so the
 * layouts follow the official forms closely enough that an inspector recognises
 * them: the same column letters, the same headings, the same order, the same
 * three-year retention note.
 *
 * Two guarantees:
 *
 *  - The 300A totals come from `summarise300A`, which throws rather than return
 *    a summary that disagrees with the log.
 *  - Every page carries the form-logic version and the generation timestamp in
 *    the footer, so a form printed today is traceable to the rules that produced
 *    it.
 */

import { PDFDocument } from "pdf-lib";
import type { Company } from "@/db/schema";
import { FORM_LOGIC_VERSION, PRIVACY_MASK, privacyReasonLabel, severeDuty } from "@/lib/incidents";
import {
  describeCase,
  toForm300Rows,
  type Form300ASummary,
  type Form300Row,
  type IncidentWithEmployee,
} from "@/lib/incident-store";
import {
  createDoc,
  drawFooter,
  drawText,
  hairline,
  wrapText,
  INK,
  LETTER_LANDSCAPE,
  LETTER_PORTRAIT,
  MUTED,
  box,
  mark,
  vrule,
  type Doc,
} from "@/lib/pdf";
import { monthDayYear } from "@/lib/dates";

const MARGIN = 30;
/** Vertical space the row band gets on a landscape page, below the header band. */
const TABLE_BODY_HEIGHT = 400;

function establishment(company: Company): string {
  return company.establishmentName?.trim() || company.name;
}

function addressLine(company: Company): string {
  const parts = [company.streetAddress, company.city, company.state, company.postalCode].filter(
    Boolean,
  );
  return parts.join(", ") || "Address not set — add it in Settings";
}

function footer(company: Company, page: number, pages: number, label: string) {
  return {
    left: `${establishment(company)} · ${label} · form logic ${FORM_LOGIC_VERSION} · generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    right: `Page ${page} of ${pages}`,
  };
}

/* ------------------------------------------------------------------- 300 --- */

interface Column {
  key: string;
  label: string;
  sub?: string;
  width: number;
}

const COLUMNS: Column[] = [
  { key: "case", label: "(A)", sub: "Case no.", width: 34 },
  { key: "name", label: "(B)", sub: "Employee name", width: 96 },
  { key: "title", label: "(C)", sub: "Job title", width: 78 },
  { key: "date", label: "(D)", sub: "Date of injury", width: 54 },
  { key: "where", label: "(E)", sub: "Where it occurred", width: 104 },
  { key: "desc", label: "(F)", sub: "Describe injury or illness", width: 156 },
  { key: "g", label: "(G)", sub: "Death", width: 29 },
  { key: "h", label: "(H)", sub: "Days away", width: 29 },
  { key: "i", label: "(I)", sub: "Transfer", width: 29 },
  { key: "j", label: "(J)", sub: "Other", width: 29 },
  { key: "k", label: "(K)", sub: "Days away", width: 32 },
  { key: "l", label: "(L)", sub: "Days restr.", width: 32 },
  { key: "m", label: "(M)", sub: "Type", width: 58 },
];

const CATEGORY_SHORT: Record<string, string> = {
  injury: "1 Injury",
  skin_disorder: "2 Skin",
  respiratory: "3 Resp.",
  poisoning: "4 Poison",
  hearing_loss: "5 Hearing",
  other_illness: "6 Other",
};

export interface Render300Input {
  company: Company;
  year: number;
  cases: IncidentWithEmployee[];
}

export async function render300(input: Render300Input): Promise<Uint8Array> {
  const doc = await createDoc(
    `OSHA Form 300 — ${establishment(input.company)} — ${input.year}`,
    "Log of Work-Related Injuries and Illnesses",
  );
  const rows = toForm300Rows(input.cases);

  // Pages are packed by measured height, not by a row count: rows are as tall as
  // their description needs, and a fixed twelve-per-page would either waste half a
  // sheet or run a case off the bottom of one.
  const descColumn = COLUMNS.find((c) => c.key === "desc")!;
  const pages: Form300Row[][] = [];
  let current: Form300Row[] = [];
  let used = 0;
  for (const row of rows) {
    const height = row300Height(row, doc, descColumn.width);
    if (current.length > 0 && used + height > TABLE_BODY_HEIGHT) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(row);
    used += height;
  }
  if (current.length > 0 || pages.length === 0) pages.push(current);

  pages.forEach((slice, i) => draw300Page(doc, input, slice, i + 1, pages.length));
  return doc.pdf.save();
}

/** Height one case needs, driven by the longest wrapped cell. */
function row300Height(row: Form300Row, doc: Doc, descWidth: number): number {
  const descLines = wrapText(row.description, doc.fonts.regular, 6.6, descWidth - 4).length;
  const whereLines = wrapText(row.whereOccurred, doc.fonts.regular, 7, 100).length;
  return Math.max(34, Math.max(descLines, whereLines) * 7.6 + 8);
}

function draw300Page(
  doc: Doc,
  input: Render300Input,
  rows: Form300Row[],
  page: number,
  pages: number,
): void {
  const { fonts } = doc;
  const p = doc.pdf.addPage(LETTER_LANDSCAPE);
  const { width } = p.getSize();
  let y = 582;

  drawText(p, fonts, "OSHA's Form 300", MARGIN, y, { size: 15, font: fonts.bold });
  drawText(p, fonts, `Year ${input.year}`, width - MARGIN - 70, y, {
    size: 12,
    font: fonts.bold,
  });
  y -= 18;
  drawText(p, fonts, "Log of Work-Related Injuries and Illnesses", MARGIN, y, {
    size: 10.5,
    font: fonts.bold,
  });
  y -= 14;
  drawText(
    p,
    fonts,
    "You must record information about every work-related injury or illness that involves loss of consciousness, restricted work activity or job transfer, days away from work, or medical treatment beyond first aid. You must also record significant work-related injuries and illnesses that are diagnosed by a physician or licensed health care professional. 29 CFR Part 1904 · Retain for five years following the year that it covers.",
    MARGIN,
    y,
    { size: 6.6, color: MUTED, maxWidth: width - MARGIN * 2 },
  );
  y -= 22;

  drawText(p, fonts, `Establishment: ${establishment(input.company)}`, MARGIN, y, {
    size: 8.5,
    font: fonts.bold,
  });
  drawText(p, fonts, addressLine(input.company), MARGIN + 260, y, { size: 8.5, color: MUTED });
  const naics = input.company.naicsCode ? `NAICS ${input.company.naicsCode}` : "NAICS not set";
  drawText(p, fonts, naics, width - MARGIN - 90, y, { size: 8.5, color: MUTED });
  y -= 16;

  // Header band.
  const tableTop = y;
  hairline(p, MARGIN, tableTop, width - MARGIN * 2, INK);
  let x = MARGIN;
  for (const col of COLUMNS) {
    drawText(p, fonts, col.label, x + 2, tableTop - 2, { size: 6.6, font: fonts.bold });
    if (col.sub) {
      drawText(p, fonts, col.sub, x + 2, tableTop - 11, {
        size: 6.2,
        color: MUTED,
        maxWidth: col.width - 4,
      });
    }
    vrule(p, x, tableTop, 30, INK);
    x += col.width;
  }
  vrule(p, x, tableTop, 30, INK);
  hairline(p, MARGIN, tableTop - 30, width - MARGIN * 2, INK);

  // Rows. Height is driven by the longest cell, because column (F) is where the
  // case is actually described and a fixed row height silently truncates the one
  // column an inspector reads.
  let rowTop = tableTop - 30;
  const descColumn = COLUMNS.find((c) => c.key === "desc")!;
  for (const row of rows) {
    x = MARGIN;
    const rowHeight = row300Height(row, doc, descColumn.width);
    const cells: Record<string, string> = {
      case: String(row.caseNumber),
      name: row.logName,
      title: row.jobTitle,
      date: row.dateOfInjury,
      where: row.whereOccurred,
      desc: row.description,
      g: row.outcome === "death" ? "X" : "",
      h: row.outcome === "days_away" ? "X" : "",
      i: row.outcome === "restricted" ? "X" : "",
      j: row.outcome === "other_recordable" ? "X" : "",
      k: row.daysAway ? String(row.daysAway) : "",
      l: row.daysRestricted ? String(row.daysRestricted) : "",
      m: CATEGORY_SHORT[row.illnessCategory] ?? "",
    };
    for (const col of COLUMNS) {
      const value = cells[col.key] ?? "";
      const centred = ["g", "h", "i", "j"].includes(col.key);
      if (centred && value) {
        mark(p, fonts, x + col.width / 2 - 3, rowTop - 6);
      } else if (value) {
        drawText(p, fonts, value, x + 2, rowTop - 3, {
          size: col.key === "desc" ? 6.6 : 7,
          maxWidth: col.width - 4,
          font: col.key === "case" ? fonts.monoBold : fonts.regular,
          lineHeight: 7.6,
        });
      }
      vrule(p, x, rowTop, rowHeight);
      x += col.width;
    }
    vrule(p, x, rowTop, rowHeight);
    rowTop -= rowHeight;
    hairline(p, MARGIN, rowTop, width - MARGIN * 2);
  }

  if (rows.length === 0) {
    drawText(
      p,
      fonts,
      "No recordable cases for this year. A year with zero recordable cases still requires the 300A summary to be completed, certified, and posted from February 1 to April 30.",
      MARGIN + 4,
      rowTop - 10,
      { size: 8, color: MUTED, maxWidth: width - MARGIN * 2 - 8 },
    );
    rowTop -= 30;
  }

  const privacy = rows.filter((r) => r.privacyCase).length;
  if (privacy > 0) {
    drawText(
      p,
      fonts,
      `${privacy} case${privacy === 1 ? "" : "s"} on this page ${privacy === 1 ? "is a" : "are"} privacy-concern case${privacy === 1 ? "" : "s"} under 1904.29(b)(7): the name is withheld from this log and kept on a separate confidential list.`,
      MARGIN,
      rowTop - 8,
      { size: 6.8, color: MUTED, maxWidth: width - MARGIN * 2 },
    );
  }

  drawFooter(p, fonts, footer(input.company, page, pages, "Form 300"), MARGIN);
}

/* ------------------------------------------------------------------- 301 --- */

export interface Render301Input {
  company: Company;
  incident: IncidentWithEmployee;
}

export async function render301(input: Render301Input): Promise<Uint8Array> {
  const doc = await createDoc(
    `OSHA Form 301 — case ${input.incident.incident.caseNumber}`,
    "Injury and Illness Incident Report",
  );
  const { fonts } = doc;
  const p = doc.pdf.addPage(LETTER_PORTRAIT);
  const { width } = p.getSize();
  const inner = width - MARGIN * 2;
  const { incident, employee, logName } = input.incident;
  let y = 762;

  drawText(p, fonts, "OSHA's Form 301", MARGIN, y, { size: 15, font: fonts.bold });
  y -= 18;
  drawText(p, fonts, "Injury and Illness Incident Report", MARGIN, y, {
    size: 10.5,
    font: fonts.bold,
  });
  y -= 13;
  drawText(
    p,
    fonts,
    "This Injury and Illness Incident Report is one of the first forms you must fill out when a recordable work-related injury or illness has occurred. Keep it on file for five years following the year to which it pertains. 29 CFR 1904.29(b)(3).",
    MARGIN,
    y,
    { size: 7, color: MUTED, maxWidth: inner },
  );
  y -= 26;

  drawText(p, fonts, `Case number ${incident.caseNumber} · ${incident.year}`, MARGIN, y, {
    size: 10,
    font: fonts.monoBold,
  });
  drawText(
    p,
    fonts,
    incident.recordable ? "RECORDABLE" : "NOT RECORDABLE",
    width - MARGIN - 90,
    y,
    { size: 9, font: fonts.bold },
  );
  y -= 18;
  hairline(p, MARGIN, y, inner, INK);
  y -= 14;

  y -= section(doc, p, "Information about the employee", MARGIN, y, inner, [
    ["Full name", incident.privacyCase ? `${PRIVACY_MASK} (name on the confidential list)` : employee.name],
    ["Job title", employee.jobTitle ?? "—"],
    ["Date hired", employee.hireDate ?? "—"],
    ["Crew / site", incident.siteLabel],
  ]);

  y -= 8;
  y -= section(doc, p, "Information about the case", MARGIN, y, inner, [
    ["Date of injury or illness", monthDayYear(incident.occurredAt.toISOString().slice(0, 10))],
    ["Time of event", incident.occurredAt.toISOString().slice(11, 16) + " UTC"],
    ["Employer learned of it", incident.learnedAt.toISOString().slice(0, 16).replace("T", " ") + " UTC"],
    ["Where the event occurred", incident.whereOccurred ?? incident.siteLabel],
  ]);

  y -= 8;
  y -= paragraph(
    doc,
    p,
    "What was the employee doing just before the incident occurred?",
    incident.description,
    MARGIN,
    y,
    inner,
  );
  y -= paragraph(
    doc,
    p,
    "What object or substance directly harmed the employee?",
    incident.objectSubstance ?? "Not recorded",
    MARGIN,
    y,
    inner,
  );
  y -= paragraph(
    doc,
    p,
    "What was the injury or illness?",
    [
      incident.injuryType,
      incident.bodyPart ? `Body part: ${incident.bodyPart}` : null,
      `Type on the 300 log: ${CATEGORY_SHORT[incident.illnessCategory] ?? incident.illnessCategory}`,
    ]
      .filter(Boolean)
      .join(". "),
    MARGIN,
    y,
    inner,
  );

  y -= 8;
  y -= section(doc, p, "Treatment and outcome", MARGIN, y, inner, [
    ["Treatment", treatmentLabel(incident.treatment)],
    ["Days away from work", String(incident.daysAway)],
    ["Days of job transfer or restriction", String(incident.daysRestricted)],
    ["Still accruing days", incident.stillCounting ? "Yes — counts will be updated" : "No"],
    ["Loss of consciousness", incident.lostConsciousness ? "Yes" : "No"],
    ["Significant diagnosis", incident.significantDiagnosis ? "Yes" : "No"],
  ]);

  y -= 8;
  drawText(p, fonts, "Recordability determination", MARGIN, y, { size: 8, font: fonts.bold });
  y -= 12;
  drawText(p, fonts, `${incident.recordabilityBasis.criterion} — ${incident.recordabilityBasis.citation}`, MARGIN, y, {
    size: 8.5,
    font: fonts.bold,
  });
  y -= 12;
  y -= drawText(p, fonts, incident.recordabilityBasis.explanation, MARGIN, y, {
    size: 8,
    color: MUTED,
    maxWidth: inner,
  });

  if (incident.privacyCase) {
    y -= 8;
    y -= drawText(
      p,
      fonts,
      `Privacy-concern case under 29 CFR 1904.29(b)(7): ${privacyReasonLabel(incident.privacyReason) ?? "category recorded in SafetyDeck"}. The name is withheld from the Form 300 and kept on a separate confidential list.`,
      MARGIN,
      y,
      { size: 8, maxWidth: inner },
    );
  }

  const duty = severeDuty(
    {
      treatment: incident.treatment,
      amputationOrEyeLoss: Boolean(incident.recordabilityBasis.answers.amputationOrEyeLoss),
    },
    incident.learnedAt,
  );
  if (duty.required) {
    y -= 12;
    box(p, MARGIN, y, inner, 46);
    drawText(
      p,
      fonts,
      `${duty.hours}-hour OSHA notification duty — ${duty.citation}`,
      MARGIN + 8,
      y - 6,
      { size: 8.5, font: fonts.bold },
    );
    drawText(
      p,
      fonts,
      incident.reportedToOshaAt
        ? `Reported to OSHA ${incident.reportedToOshaAt.toISOString().slice(0, 16).replace("T", " ")} UTC. ${incident.oshaReportNote ?? ""}`
        : "Not yet recorded as reported in SafetyDeck. SafetyDeck does not file on the employer's behalf.",
      MARGIN + 8,
      y - 20,
      { size: 8, maxWidth: inner - 16, color: MUTED },
    );
    y -= 50;
  }

  y -= 16;
  drawText(p, fonts, "Completed by", MARGIN, y, { size: 8, font: fonts.bold });
  y -= 12;
  drawText(
    p,
    fonts,
    `${incident.createdBy} · entered ${incident.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    MARGIN,
    y,
    { size: 8, color: MUTED },
  );

  drawFooter(p, fonts, footer(input.company, 1, 1, `Form 301 · case ${incident.caseNumber}`), MARGIN);
  return doc.pdf.save();
}

function treatmentLabel(t: string): string {
  switch (t) {
    case "none":
      return "No treatment given";
    case "first_aid":
      return "First aid only — 1904.7(b)(5)(ii)";
    case "observation":
      return "Observation or diagnostic visit only — not medical treatment, 1904.7(b)(5)(ii)(A)";
    case "medical":
      return "Medical treatment beyond first aid";
    case "er":
      return "Treated at an emergency room or urgent care";
    case "hospitalized":
      return "Admitted to hospital as an in-patient";
    case "fatality":
      return "Fatality";
    default:
      return t;
  }
}

function section(
  doc: Doc,
  p: import("pdf-lib").PDFPage,
  title: string,
  x: number,
  yTop: number,
  width: number,
  fields: [string, string][],
): number {
  const { fonts } = doc;
  let used = 0;
  used += drawText(p, fonts, title, x, yTop, { size: 8, font: fonts.bold });
  used += 4;
  for (const [label, value] of fields) {
    const rowTop = yTop - used;
    drawText(p, fonts, label, x, rowTop, { size: 7.4, color: MUTED, maxWidth: 168 });
    const h = drawText(p, fonts, value || "—", x + 176, rowTop, {
      size: 8.4,
      maxWidth: width - 176,
    });
    used += Math.max(h, 13);
    hairline(p, x, yTop - used + 2, width);
  }
  return used;
}

function paragraph(
  doc: Doc,
  p: import("pdf-lib").PDFPage,
  question: string,
  answer: string,
  x: number,
  yTop: number,
  width: number,
): number {
  const { fonts } = doc;
  let used = drawText(p, fonts, question, x, yTop, {
    size: 7.4,
    color: MUTED,
    maxWidth: width,
  });
  used += 2;
  used += drawText(p, fonts, answer, x, yTop - used, { size: 8.4, maxWidth: width });
  used += 8;
  return used;
}

/* ------------------------------------------------------------------ 300A --- */

export interface Render300AInput {
  company: Company;
  summary: Form300ASummary;
  certifiedBy: { name: string | null; title: string | null; phone: string | null; at: Date | null };
}

export async function render300A(input: Render300AInput): Promise<Uint8Array> {
  const doc = await createDoc(
    `OSHA Form 300A — ${establishment(input.company)} — ${input.summary.year}`,
    "Summary of Work-Related Injuries and Illnesses",
  );
  const { fonts } = doc;
  const p = doc.pdf.addPage(LETTER_PORTRAIT);
  const { width } = p.getSize();
  const inner = width - MARGIN * 2;
  const s = input.summary;
  let y = 762;

  drawText(p, fonts, "OSHA's Form 300A", MARGIN, y, { size: 15, font: fonts.bold });
  drawText(p, fonts, `Year ${s.year}`, width - MARGIN - 62, y, { size: 12, font: fonts.bold });
  y -= 18;
  drawText(p, fonts, "Summary of Work-Related Injuries and Illnesses", MARGIN, y, {
    size: 10.5,
    font: fonts.bold,
  });
  y -= 13;
  y -= drawText(
    p,
    fonts,
    "All establishments covered by Part 1904 must complete this Summary page, even if no work-related injuries or illnesses occurred during the year. Post this Summary page from February 1 to April 30 of the year following the year covered by the form. 29 CFR 1904.32.",
    MARGIN,
    y,
    { size: 7, color: MUTED, maxWidth: inner },
  );
  y -= 14;

  // Establishment block.
  box(p, MARGIN, y, inner, 74);
  drawText(p, fonts, "Establishment information", MARGIN + 8, y - 6, {
    size: 7.4,
    color: MUTED,
  });
  drawText(p, fonts, establishment(input.company), MARGIN + 8, y - 18, {
    size: 10,
    font: fonts.bold,
  });
  drawText(p, fonts, addressLine(input.company), MARGIN + 8, y - 34, { size: 8.4 });
  drawText(
    p,
    fonts,
    `Industry description: ${input.company.industryDescription ?? "not set"}`,
    MARGIN + 8,
    y - 48,
    { size: 8.4, maxWidth: inner - 16 },
  );
  drawText(
    p,
    fonts,
    `NAICS: ${input.company.naicsCode ?? "not set"}`,
    MARGIN + 8,
    y - 62,
    { size: 8.4 },
  );
  y -= 86;

  // Number of cases.
  drawText(p, fonts, "Number of cases", MARGIN, y, { size: 8.6, font: fonts.bold });
  y -= 14;
  y -= totalsGrid(doc, p, MARGIN, y, inner, [
    ["(G) Total number of deaths", s.deaths],
    ["(H) Total number of cases with days away from work", s.daysAwayCases],
    ["(I) Total number of cases with job transfer or restriction", s.restrictedCases],
    ["(J) Total number of other recordable cases", s.otherRecordableCases],
  ]);

  y -= 10;
  drawText(p, fonts, "Number of days", MARGIN, y, { size: 8.6, font: fonts.bold });
  y -= 14;
  y -= totalsGrid(doc, p, MARGIN, y, inner, [
    ["(K) Total number of days away from work", s.totalDaysAway],
    ["(L) Total number of days of job transfer or restriction", s.totalDaysRestricted],
  ]);

  y -= 10;
  drawText(p, fonts, "Injury and illness types", MARGIN, y, { size: 8.6, font: fonts.bold });
  y -= 14;
  y -= totalsGrid(doc, p, MARGIN, y, inner, [
    ["(M1) Injuries", s.byCategory.injury],
    ["(M2) Skin disorders", s.byCategory.skin_disorder],
    ["(M3) Respiratory conditions", s.byCategory.respiratory],
    ["(M4) Poisonings", s.byCategory.poisoning],
    ["(M5) Hearing loss", s.byCategory.hearing_loss],
    ["(M6) All other illnesses", s.byCategory.other_illness],
  ]);

  y -= 10;
  drawText(p, fonts, "Employment information", MARGIN, y, { size: 8.6, font: fonts.bold });
  y -= 14;
  y -= totalsGrid(doc, p, MARGIN, y, inner, [
    ["Annual average number of employees", s.annualAvgEmployees],
    ["Total hours worked by all employees last year", s.totalHoursWorked],
  ]);

  if (s.annualAvgEmployees === null || s.totalHoursWorked === null) {
    y -= 4;
    y -= drawText(
      p,
      fonts,
      "The employment denominators are not set for this year. Fill them in under Settings before posting — an incident rate cannot be calculated without them.",
      MARGIN,
      y,
      { size: 7.6, maxWidth: inner },
    );
  }

  y -= 12;
  box(p, MARGIN, y, inner, 96);
  drawText(p, fonts, "Certification", MARGIN + 8, y - 6, { size: 7.4, color: MUTED });
  drawText(
    p,
    fonts,
    "I certify that I have examined this document and that to the best of my knowledge the entries are true, accurate, and complete. A company executive must certify this Summary — 29 CFR 1904.32(b)(3).",
    MARGIN + 8,
    y - 18,
    { size: 7.6, maxWidth: inner - 16, color: MUTED },
  );
  const signLine = y - 52;
  hairline(p, MARGIN + 8, signLine, 250, INK);
  drawText(p, fonts, input.certifiedBy.name ?? "", MARGIN + 10, signLine + 14, { size: 10 });
  drawText(p, fonts, "Company executive (print and sign)", MARGIN + 8, signLine - 2, {
    size: 6.8,
    color: MUTED,
  });
  hairline(p, MARGIN + 276, signLine, inner - 284, INK);
  drawText(
    p,
    fonts,
    input.certifiedBy.at ? input.certifiedBy.at.toISOString().slice(0, 10) : "",
    MARGIN + 278,
    signLine + 14,
    { size: 10 },
  );
  drawText(p, fonts, "Date", MARGIN + 276, signLine - 2, { size: 6.8, color: MUTED });
  drawText(
    p,
    fonts,
    `Title: ${input.certifiedBy.title ?? "—"}    Phone: ${input.certifiedBy.phone ?? "—"}`,
    MARGIN + 8,
    signLine - 16,
    { size: 8 },
  );
  y -= 104;

  if (s.openCases > 0 || s.needsJudgmentCases > 0) {
    const notes: string[] = [];
    if (s.openCases > 0) {
      notes.push(
        `${s.openCases} case${s.openCases === 1 ? "" : "s"} still accruing days away or restricted days — the K and L totals will change and the Summary must be updated before it is posted.`,
      );
    }
    if (s.needsJudgmentCases > 0) {
      notes.push(
        `${s.needsJudgmentCases} case${s.needsJudgmentCases === 1 ? "" : "s"} recorded as recordable pending a judgment call. Resolve them against 29 CFR 1904 before certifying.`,
      );
    }
    drawText(p, fonts, notes.join(" "), MARGIN, y, { size: 7.6, maxWidth: inner });
  }

  drawFooter(p, fonts, footer(input.company, 1, 1, "Form 300A"), MARGIN);
  return doc.pdf.save();
}

function totalsGrid(
  doc: Doc,
  p: import("pdf-lib").PDFPage,
  x: number,
  yTop: number,
  width: number,
  rows: [string, number | null][],
): number {
  const { fonts } = doc;
  let used = 0;
  for (const [label, value] of rows) {
    const rowTop = yTop - used;
    drawText(p, fonts, label, x, rowTop, { size: 8.2, maxWidth: width - 70 });
    const text = value === null ? "—" : String(value);
    const w = fonts.monoBold.widthOfTextAtSize(text, 10);
    drawText(p, fonts, text, x + width - w - 6, rowTop, { size: 10, font: fonts.monoBold });
    used += 16;
    hairline(p, x, yTop - used + 3, width);
  }
  return used;
}

/** Merge already-rendered PDFs into one document — used by the binder. */
export async function mergePdfs(
  parts: Uint8Array[],
  meta?: { title: string; subject: string },
): Promise<{ bytes: Uint8Array; pages: number }> {
  const out = await PDFDocument.create();
  if (meta) {
    out.setTitle(meta.title);
    out.setSubject(meta.subject);
  }
  out.setProducer("SafetyDeck");
  out.setCreator("SafetyDeck");
  for (const part of parts) {
    const src = await PDFDocument.load(part);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return { bytes: await out.save(), pages: out.getPageCount() };
}

export { describeCase };
