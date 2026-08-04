/**
 * src/lib/contracts.ts
 *
 * The signed contract, the run sheet, and the audit trail that makes a signature
 * mean something.
 *
 * The e-sign pattern: render the *exact* document the customer read — lines,
 * window, totals, terms, the damage-fee schedule, their typed name and initials —
 * to a PDF, sha256 the bytes, and store the hash on the order. The hash is the
 * claim: this is the document that was agreed, and here is proof it has not been
 * edited since. A contract PDF generated later from live data would prove nothing,
 * which is why the PDF is written once, at signing, and never regenerated.
 */

import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatDateLong, formatWindow, type IsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { DamageFee } from "@/db/schema";
import type { LoadListEntry, Stop } from "@/lib/runs-core";

export function hashDocument(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The PDFs are the one place in this codebase that names colours outside
 * globals.css, because pdf-lib cannot read a CSS custom property. They are the
 * same three values DESIGN.md specifies, and craft-check exempts this file by
 * name for exactly this reason.
 */
const INK = rgb(0.137, 0.141, 0.122); // #23241F
const DIM = rgb(0.431, 0.427, 0.384); // #6E6D62
const LINE = rgb(0.867, 0.847, 0.792); // #DDD8CA

const PAGE_W = 595.28; // A4 portrait
const PAGE_H = 841.89;
const MARGIN = 48;

/**
 * pdf-lib's standard fonts are WinAnsi, and `drawText` **throws** on anything
 * outside it — `WinAnsi cannot encode "→"`. That is a runtime crash in the middle
 * of signing a contract, and nothing in the build sees it coming: the arrow came
 * from `formatWindow`, a display helper the screens use happily.
 *
 * So every string drawn into a PDF passes through here first. Typographic
 * characters map to their ASCII equivalents, and anything still outside Latin-1 is
 * dropped rather than allowed to abort the document.
 */
const SUBSTITUTIONS: Array<[RegExp, string]> = [
  [/→/g, "->"], // →
  [/←/g, "<-"],
  [/[–—]/g, "-"], // – —
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
  [/…/g, "..."],
  [/ /g, " "],
  [/[•·]/g, "-"], // • ·
  [/×/g, "x"], // ×
  [/−/g, "-"], // minus sign
];

export function winAnsi(value: string): string {
  let out = value;
  for (const [pattern, replacement] of SUBSTITUTIONS) out = out.replace(pattern, replacement);
  // Anything left outside printable Latin-1 would still throw; drop it.
  return out.replace(/[^\x20-\x7E\xA1-\xFF]/g, "");
}

export interface ContractInput {
  yardName: string;
  orderNumber: number;
  customerName: string;
  customerCompany: string | null;
  outOn: IsoDate;
  dueBackOn: IsoDate;
  delivery: boolean;
  address: string | null;
  lines: Array<{ itemName: string; quantity: number; rateCents: number; lineTotalCents: number }>;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
  damageFees: Array<{ itemName: string; fees: DamageFee[]; replacementCents: number | null }>;
  terms: string;
  damageClause: string;
  signerName: string;
  signerInitials: string;
  signedAt: Date;
  simulatedDeposit: boolean;
}

interface Cursor {
  y: number;
  page: import("pdf-lib").PDFPage;
}

export async function renderContractPdf(input: ContractInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  const cursor: Cursor = { y: PAGE_H - MARGIN, page };

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    cursor.page = page;
    cursor.y = PAGE_H - MARGIN;
  };
  const need = (space: number) => {
    if (cursor.y - space < MARGIN) newPage();
  };
  const text = (
    value: string,
    opts: { size?: number; font?: import("pdf-lib").PDFFont; color?: typeof INK; x?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    need(size + 4);
    cursor.page.drawText(winAnsi(value), {
      x: opts.x ?? MARGIN,
      y: cursor.y - size,
      size,
      font: opts.font ?? body,
      color: opts.color ?? INK,
    });
    cursor.y -= size + 4;
  };
  const rule = () => {
    need(10);
    cursor.page.drawLine({
      start: { x: MARGIN, y: cursor.y },
      end: { x: PAGE_W - MARGIN, y: cursor.y },
      thickness: 0.75,
      color: LINE,
    });
    cursor.y -= 10;
  };
  const gap = (space = 10) => {
    cursor.y -= space;
  };
  const paragraph = (value: string, size = 9.5) => {
    const maxWidth = PAGE_W - MARGIN * 2;
    for (const block of value.split("\n")) {
      if (!block.trim()) {
        gap(6);
        continue;
      }
      let current = "";
      for (const word of block.split(/\s+/)) {
        const candidate = current ? `${current} ${word}` : word;
        if (body.widthOfTextAtSize(winAnsi(candidate), size) > maxWidth) {
          text(current, { size });
          current = word;
        } else {
          current = candidate;
        }
      }
      if (current) text(current, { size });
      gap(4);
    }
  };

  /* --- header --- */
  text(input.yardName.toUpperCase(), { size: 9, font: bold, color: DIM });
  gap(2);
  text(`RENTAL AGREEMENT — ORDER #${input.orderNumber}`, { size: 16, font: bold });
  gap(4);
  text(formatWindow(input.outOn, input.dueBackOn), { size: 10, font: mono, color: DIM });
  rule();

  /* --- parties --- */
  text("CUSTOMER", { size: 8, font: bold, color: DIM });
  text(input.customerName, { size: 11, font: bold });
  if (input.customerCompany) text(input.customerCompany, { size: 9.5, color: DIM });
  if (input.delivery && input.address) {
    gap(4);
    text("DELIVER TO", { size: 8, font: bold, color: DIM });
    paragraph(input.address);
  } else {
    gap(4);
    text("CUSTOMER PICKUP FROM THE YARD", { size: 8, font: bold, color: DIM });
  }
  rule();

  /* --- lines --- */
  text("GEAR", { size: 8, font: bold, color: DIM });
  gap(2);
  for (const line of input.lines) {
    need(16);
    cursor.page.drawText(winAnsi(`${line.quantity} x ${line.itemName}`), {
      x: MARGIN,
      y: cursor.y - 10,
      size: 10,
      font: body,
      color: INK,
    });
    const amount = formatMoney(line.lineTotalCents);
    const width = mono.widthOfTextAtSize(winAnsi(amount), 10);
    cursor.page.drawText(winAnsi(amount), {
      x: PAGE_W - MARGIN - width,
      y: cursor.y - 10,
      size: 10,
      font: mono,
      color: INK,
    });
    const rate = `${formatMoney(line.rateCents)} each for this window`;
    const rateWidth = mono.widthOfTextAtSize(winAnsi(rate), 8);
    cursor.page.drawText(winAnsi(rate), {
      x: PAGE_W - MARGIN - rateWidth - width - 12,
      y: cursor.y - 10,
      size: 8,
      font: mono,
      color: DIM,
    });
    cursor.y -= 16;
  }
  rule();

  /* --- totals --- */
  const totalRow = (label: string, cents: number, strong = false) => {
    need(15);
    cursor.page.drawText(winAnsi(label), {
      x: MARGIN,
      y: cursor.y - 10,
      size: strong ? 11 : 10,
      font: strong ? bold : body,
      color: strong ? INK : DIM,
    });
    const value = formatMoney(cents);
    const width = mono.widthOfTextAtSize(winAnsi(value), strong ? 12 : 10);
    cursor.page.drawText(winAnsi(value), {
      x: PAGE_W - MARGIN - width,
      y: cursor.y - 10,
      size: strong ? 12 : 10,
      font: mono,
      color: INK,
    });
    cursor.y -= 15;
  };
  totalRow("Subtotal", input.subtotalCents);
  totalRow("Tax", input.taxCents);
  totalRow("Total due", input.totalCents, true);
  gap(4);
  totalRow("Security deposit — authorisation hold, not a charge", input.depositCents);
  if (input.simulatedDeposit) {
    text(
      "This agreement was signed in a RigRent demo environment; the deposit hold was simulated and no card was contacted.",
      { size: 8, color: DIM },
    );
  }
  rule();

  /* --- damage fee schedule --- */
  text("DAMAGE FEE SCHEDULE", { size: 8, font: bold, color: DIM });
  gap(2);
  for (const entry of input.damageFees) {
    need(14);
    text(entry.itemName, { size: 9.5, font: bold });
    for (const fee of entry.fees) {
      need(12);
      cursor.page.drawText(winAnsi(`   ${fee.label}`), {
        x: MARGIN,
        y: cursor.y - 9,
        size: 9,
        font: body,
        color: INK,
      });
      const value = formatMoney(fee.amountCents);
      const width = mono.widthOfTextAtSize(winAnsi(value), 9);
      cursor.page.drawText(winAnsi(value), {
        x: PAGE_W - MARGIN - width,
        y: cursor.y - 9,
        size: 9,
        font: mono,
        color: INK,
      });
      cursor.y -= 12;
    }
    if (entry.replacementCents) {
      need(12);
      cursor.page.drawText(winAnsi("   Replacement (missing)"), {
        x: MARGIN,
        y: cursor.y - 9,
        size: 9,
        font: body,
        color: INK,
      });
      const value = formatMoney(entry.replacementCents);
      const width = mono.widthOfTextAtSize(winAnsi(value), 9);
      cursor.page.drawText(winAnsi(value), {
        x: PAGE_W - MARGIN - width,
        y: cursor.y - 9,
        size: 9,
        font: mono,
        color: INK,
      });
      cursor.y -= 12;
    }
    gap(2);
  }
  rule();

  /* --- terms --- */
  text("TERMS", { size: 8, font: bold, color: DIM });
  gap(2);
  paragraph(input.terms);
  rule();

  /* --- damage clause, initialled separately --- */
  text("CONDITION AND DAMAGE", { size: 8, font: bold, color: DIM });
  gap(2);
  paragraph(input.damageClause);
  gap(6);
  need(30);
  text(`Initialled: ${input.signerInitials}`, { size: 11, font: bold });
  rule();

  /* --- signature --- */
  text("SIGNED", { size: 8, font: bold, color: DIM });
  text(input.signerName, { size: 13, font: bold });
  text(`${formatDateLong(input.signedAt.toISOString().slice(0, 10))} — ${input.signedAt.toISOString()}`, {
    size: 9,
    font: mono,
    color: DIM,
  });
  gap(6);
  paragraph(
    "This document was signed electronically. Its sha256 hash is recorded against the order at the moment of signing; any later edit to this file changes the hash and is detectable.",
    8,
  );

  return doc.save();
}

export interface RunSheetInput {
  yardName: string;
  kind: "delivery" | "pickup";
  runOn: IsoDate;
  truckLabel: string | null;
  driverName: string | null;
  stops: Stop[];
  loadList: LoadListEntry[];
}

/**
 * The run sheet: what goes on the truck, then where it goes. Load list first,
 * because the sheet is read at the warehouse door before it is read on the road.
 */
export async function renderRunSheetPdf(input: RunSheetInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const need = (space: number) => {
    if (y - space < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };
  const line = (
    value: string,
    size = 10,
    font: import("pdf-lib").PDFFont = body,
    color = INK,
    indent = 0,
  ) => {
    need(size + 4);
    page.drawText(winAnsi(value), { x: MARGIN + indent, y: y - size, size, font, color });
    y -= size + 4;
  };
  const rule = () => {
    need(10);
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.75,
      color: LINE,
    });
    y -= 10;
  };
  const rightOf = (value: string, size: number, baselineOffset: number) => {
    const width = mono.widthOfTextAtSize(winAnsi(value), size);
    page.drawText(winAnsi(value), {
      x: PAGE_W - MARGIN - width,
      y: y + baselineOffset,
      size,
      font: mono,
      color: INK,
    });
  };

  line(input.yardName.toUpperCase(), 9, bold, DIM);
  line(`${input.kind === "delivery" ? "DELIVERY" : "PICKUP"} RUN — ${formatDateLong(input.runOn)}`, 16, bold);
  line(
    `${input.truckLabel ?? "Truck unassigned"} · ${input.driverName ?? "Driver unassigned"} · ${input.stops.length} stop${input.stops.length === 1 ? "" : "s"}`,
    10,
    mono,
    DIM,
  );
  rule();

  line("LOAD LIST", 9, bold, DIM);
  y -= 2;
  let currentCategory: string | null | undefined;
  for (const entry of input.loadList) {
    if (entry.category !== currentCategory) {
      currentCategory = entry.category;
      line((entry.category ?? "Uncategorised").toUpperCase(), 8, bold, DIM);
    }
    need(18);
    page.drawText(winAnsi(entry.itemName), { x: MARGIN + 8, y: y - 12, size: 11, font: body, color: INK });
    const qty = String(entry.quantity);
    const width = mono.widthOfTextAtSize(winAnsi(qty), 14);
    page.drawText(winAnsi(qty), {
      x: PAGE_W - MARGIN - width,
      y: y - 13,
      size: 14,
      font: mono,
      color: INK,
    });
    y -= 18;
    const perStop = entry.perStop.map((s) => `#${s.orderNumber}: ${s.quantity}`).join("   ");
    line(perStop, 8, mono, DIM, 8);
    y -= 2;
  }
  rule();

  line("STOPS", 9, bold, DIM);
  y -= 2;
  input.stops.forEach((stop, index) => {
    need(30);
    line(`${index + 1}.  #${stop.orderNumber}  ${stop.customerName}`, 11, bold);
    rightOf(`${stop.unitCount} units`, 9, 13);
    if (stop.address) line(stop.address, 9, body, DIM, 16);
    // Plain brackets, not a box glyph: pdf-lib's standard fonts are WinAnsi and
    // throw on anything outside it, which is a runtime crash in a PDF nobody
    // sees until a driver asks where the run sheet went.
    line("Loaded [   ]    Delivered [   ]    Photos [   ]", 10, mono, DIM, 16);
    y -= 4;
  });

  return doc.save();
}
