/**
 * src/lib/acord-sample.ts
 *
 * Builds an ACORD 25-shaped certificate PDF from structured facts.
 *
 * Two real jobs, neither of them decorative:
 *  1. The demo seed needs actual certificate PDFs. A COI tracker whose demo data
 *     has no documents in it cannot show its review queue, its PDF viewer, or its
 *     binder export — and a grey placeholder rectangle is not a certificate.
 *  2. The parser test suite needs fixtures it can vary one field at a time:
 *     a missing expiry, a two-digit year, a blank ADDL INSD column.
 *
 * The layout deliberately mirrors the printed form — one text run per table row,
 * the way an agency management system emits it — so the text a PDF reader
 * extracts is the text lib/acord.ts is written to read.
 *
 * These are facsimiles for demonstration, not issued certificates. Every sample
 * carries a "SAMPLE - NOT AN ISSUED CERTIFICATE" line, so a staged document can
 * never be mistaken for evidence.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface SamplePolicy {
  type: "gl" | "auto" | "umbrella" | "wc";
  policyNumber: string;
  /** Printed as MM/DD/YYYY unless `twoDigitYear` is set. */
  effectiveOn: string;
  expiresOn: string | null;
  /** "Y" | "N" | "" — empty prints a blank column, which forces human review. */
  addlInsured: "Y" | "N" | "";
  subrWaived: "Y" | "N" | "";
  limits: Array<{ label: string; amount: string }>;
  twoDigitYear?: boolean;
}

export interface SampleAcord {
  producer: string;
  producerContact: string;
  insured: string;
  insuredAddress: string;
  insurerA: string;
  naic: string;
  certificateNumber: string;
  issuedOn: string;
  holder: string;
  holderAddress: string;
  description: string;
  policies: SamplePolicy[];
}

const TYPE_LABEL: Record<SamplePolicy["type"], string> = {
  gl: "COMMERCIAL GENERAL LIABILITY",
  auto: "AUTOMOBILE LIABILITY",
  umbrella: "UMBRELLA LIAB / EXCESS LIAB",
  wc: "WORKERS COMPENSATION AND EMPLOYERS LIABILITY",
};

/** "2026-01-01" → "01/01/2026" (or "01/01/26"). */
function usDate(iso: string, twoDigit = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${twoDigit ? m[1].slice(2) : m[1]}`;
}

/** The single text run for one policy row — the line the grammar reads. */
export function policyRowText(p: SamplePolicy): string {
  const parts = [
    TYPE_LABEL[p.type],
    `ADDL INSD:${p.addlInsured}`,
    `SUBR WVD:${p.subrWaived}`,
    p.policyNumber,
    usDate(p.effectiveOn, p.twoDigitYear),
    p.expiresOn ? usDate(p.expiresOn, p.twoDigitYear) : "",
  ];
  const head = parts.filter((s) => s !== "").join("  ");
  const first = p.limits[0];
  return first ? `${head}  ${first.label} ${first.amount}` : head;
}

/** Continuation rows: the second and later limits inside one policy block. */
export function policyExtraLimitText(p: SamplePolicy): string[] {
  return p.limits.slice(1).map((l) => `${l.label} ${l.amount}`);
}

/** The plain text of the whole form, in reading order. Used by the tests. */
export function sampleAcordText(spec: SampleAcord): string {
  const lines: string[] = [
    "ACORD 25 (2016/03)  CERTIFICATE OF LIABILITY INSURANCE",
    `DATE (MM/DD/YYYY)  ${usDate(spec.issuedOn)}`,
    "SAMPLE - NOT AN ISSUED CERTIFICATE",
    "THIS CERTIFICATE IS ISSUED AS A MATTER OF INFORMATION ONLY AND CONFERS NO RIGHTS UPON THE CERTIFICATE HOLDER.",
    `PRODUCER: ${spec.producer}`,
    `CONTACT: ${spec.producerContact}`,
    `INSURED: ${spec.insured}`,
    spec.insuredAddress,
    `INSURER A: ${spec.insurerA}`,
    `NAIC #: ${spec.naic}`,
    `COVERAGES  CERTIFICATE NUMBER: ${spec.certificateNumber}  REVISION NUMBER:`,
    "TYPE OF INSURANCE | ADDL INSD | SUBR WVD | POLICY NUMBER | POLICY EFF | POLICY EXP | LIMITS",
  ];
  for (const p of spec.policies) {
    lines.push(policyRowText(p));
    lines.push(...policyExtraLimitText(p));
  }
  lines.push(`DESCRIPTION OF OPERATIONS: ${spec.description}`);
  lines.push(`CERTIFICATE HOLDER: ${spec.holder}`);
  lines.push(spec.holderAddress);
  lines.push(
    "SHOULD ANY OF THE ABOVE DESCRIBED POLICIES BE CANCELLED BEFORE THE EXPIRATION DATE THEREOF, NOTICE WILL BE DELIVERED IN ACCORDANCE WITH THE POLICY PROVISIONS.",
  );
  lines.push("AUTHORIZED REPRESENTATIVE");
  return lines.join("\n");
}

export async function buildSampleAcordPdf(spec: SampleAcord): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Certificate of Liability Insurance — ${spec.insured}`);
  doc.setSubject("SAMPLE — not an issued certificate");
  doc.setProducer("CertShield sample generator");
  doc.setCreationDate(new Date("2026-01-02T00:00:00Z"));
  doc.setModificationDate(new Date("2026-01-02T00:00:00Z"));

  const page = doc.addPage([612, 792]); // US Letter
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const ink = rgb(0.12, 0.14, 0.13);
  const dim = rgb(0.41, 0.44, 0.42);
  const rule = rgb(0.85, 0.86, 0.84);

  const M = 36;
  let y = 756;

  const line = (yy: number) =>
    page.drawLine({
      start: { x: M, y: yy },
      end: { x: 612 - M, y: yy },
      thickness: 0.75,
      color: rule,
    });

  const put = (
    text: string,
    opts: { size?: number; font?: typeof body; color?: typeof ink; x?: number; dy?: number } = {},
  ) => {
    const size = opts.size ?? 8;
    y -= opts.dy ?? size + 4;
    page.drawText(text, {
      x: opts.x ?? M,
      y,
      size,
      font: opts.font ?? body,
      color: opts.color ?? ink,
    });
  };

  put("ACORD 25 (2016/03)  CERTIFICATE OF LIABILITY INSURANCE", { size: 12, font: bold, dy: 0 });
  put(`DATE (MM/DD/YYYY)  ${usDate(spec.issuedOn)}`, { size: 8, font: mono, color: dim });
  put("SAMPLE - NOT AN ISSUED CERTIFICATE", { size: 8, font: bold, color: dim });
  y -= 4;
  line(y);
  put(
    "THIS CERTIFICATE IS ISSUED AS A MATTER OF INFORMATION ONLY AND CONFERS NO RIGHTS UPON THE CERTIFICATE HOLDER.",
    { size: 6.5, color: dim },
  );
  y -= 6;

  put(`PRODUCER: ${spec.producer}`, { size: 8, font: bold });
  put(`CONTACT: ${spec.producerContact}`, { size: 8, color: dim });
  y -= 2;
  put(`INSURED: ${spec.insured}`, { size: 8, font: bold });
  put(spec.insuredAddress, { size: 8, color: dim });
  y -= 2;
  put(`INSURER A: ${spec.insurerA}`, { size: 8, font: bold });
  put(`NAIC #: ${spec.naic}`, { size: 8, font: mono, color: dim });

  y -= 8;
  line(y);
  put(`COVERAGES  CERTIFICATE NUMBER: ${spec.certificateNumber}  REVISION NUMBER:`, {
    size: 8,
    font: bold,
  });
  put("TYPE OF INSURANCE | ADDL INSD | SUBR WVD | POLICY NUMBER | POLICY EFF | POLICY EXP | LIMITS", {
    size: 6,
    color: dim,
  });
  y -= 2;
  line(y);

  for (const p of spec.policies) {
    y -= 2;
    put(policyRowText(p), { size: 6.6, font: mono });
    for (const extra of policyExtraLimitText(p)) {
      put(extra, { size: 6.6, font: mono, x: M + 12 });
    }
    y -= 3;
    line(y);
  }

  y -= 6;
  put(`DESCRIPTION OF OPERATIONS: ${spec.description}`, { size: 7 });
  y -= 8;
  line(y);
  put(`CERTIFICATE HOLDER: ${spec.holder}`, { size: 9, font: bold });
  put(spec.holderAddress, { size: 8, color: dim });
  y -= 6;
  put(
    "SHOULD ANY OF THE ABOVE DESCRIBED POLICIES BE CANCELLED BEFORE THE EXPIRATION DATE THEREOF,",
    { size: 6.5, color: dim },
  );
  put("NOTICE WILL BE DELIVERED IN ACCORDANCE WITH THE POLICY PROVISIONS.", {
    size: 6.5,
    color: dim,
  });
  y -= 4;
  put("AUTHORIZED REPRESENTATIVE", { size: 7, font: bold, color: dim });

  return doc.save({ useObjectStreams: false });
}

/* ------------------------------------------------------------------ presets */

/** A clean, fully compliant certificate for a roofing sub. */
export function compliantSample(over: Partial<SampleAcord> = {}): SampleAcord {
  return {
    producer: "Harbor & Main Insurance Agency",
    producerContact: "Renee Alcantara | (503) 555-0148 | renee@harborandmain.example",
    insured: "Kestrel Roofing LLC",
    insuredAddress: "2140 SE Bybee Blvd, Portland, OR 97202",
    insurerA: "Grayline Mutual Casualty Company",
    naic: "10657",
    certificateNumber: "CS-2026-4471",
    issuedOn: "2026-01-02",
    holder: "Harbor Ridge Management LLC",
    holderAddress: "800 NW Everett St Suite 210, Portland, OR 97209",
    description:
      "Certificate holder is included as additional insured with respect to operations performed by the named insured.",
    policies: [
      {
        type: "gl",
        policyNumber: "GL-4471-22",
        effectiveOn: "2026-01-01",
        expiresOn: "2027-01-01",
        addlInsured: "Y",
        subrWaived: "Y",
        limits: [
          { label: "EACH OCCURRENCE", amount: "$1,000,000" },
          { label: "GENERAL AGGREGATE", amount: "$2,000,000" },
        ],
      },
      {
        type: "auto",
        policyNumber: "CA-8890-11",
        effectiveOn: "2026-01-01",
        expiresOn: "2027-01-01",
        addlInsured: "Y",
        subrWaived: "N",
        limits: [{ label: "COMBINED SINGLE LIMIT", amount: "$1,000,000" }],
      },
      {
        type: "umbrella",
        policyNumber: "UMB-2210-04",
        effectiveOn: "2026-01-01",
        expiresOn: "2027-01-01",
        addlInsured: "N",
        subrWaived: "N",
        limits: [{ label: "EACH OCCURRENCE", amount: "$4,000,000" }],
      },
      {
        type: "wc",
        policyNumber: "WC-5512-08",
        effectiveOn: "2026-01-01",
        expiresOn: "2027-01-01",
        addlInsured: "N",
        subrWaived: "Y",
        limits: [{ label: "E.L. EACH ACCIDENT", amount: "$1,000,000" }],
      },
    ],
    ...over,
  };
}

/** The same agency, a short GL limit and no additional-insured column. */
export function deficientSample(over: Partial<SampleAcord> = {}): SampleAcord {
  const base = compliantSample();
  return {
    ...base,
    insured: "Cordova Landscape & Irrigation",
    insuredAddress: "515 N Killingsworth St, Portland, OR 97217",
    insurerA: "Tualatin Indemnity Company",
    naic: "23417",
    certificateNumber: "CS-2026-4488",
    policies: [
      {
        type: "gl",
        policyNumber: "GL-9902-15",
        effectiveOn: "2026-02-01",
        expiresOn: "2026-08-20",
        addlInsured: "N",
        subrWaived: "Y",
        limits: [
          { label: "EACH OCCURRENCE", amount: "$500,000" },
          { label: "GENERAL AGGREGATE", amount: "$1,000,000" },
        ],
      },
      {
        type: "wc",
        policyNumber: "WC-3301-77",
        effectiveOn: "2026-02-01",
        expiresOn: "2026-08-20",
        addlInsured: "N",
        subrWaived: "Y",
        limits: [{ label: "E.L. EACH ACCIDENT", amount: "$1,000,000" }],
      },
    ],
    ...over,
  };
}
