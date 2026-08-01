/**
 * QR codes and the printables.
 *
 * The printed piece matters as much as the digital one: the incumbent this
 * product is fighting is a laminated menu, and the way to beat a print shop is
 * not to pretend paper doesn't exist. Table tents and window cards ship in the
 * base tier (README differentiation 5).
 *
 * Everything here is deterministic and vector: the same URL always produces the
 * same QR grid and the same PDF bytes.
 */

import QRCode from "qrcode";
import { PdfContent, buildPdf, inches, textWidth, wrapText } from "@/lib/pdf";
import { env } from "@/lib/env";

/** The URL a QR encodes. `menuKey` pins one daypart; omitted follows the clock. */
export function menuUrl(slug: string, menuKey?: string | null): string {
  const base = env.appUrl;
  return menuKey ? `${base}/m/${slug}/${menuKey}` : `${base}/m/${slug}`;
}

export interface QrMatrix {
  size: number;
  /** True where a dark module should be drawn. */
  dark: (x: number, y: number) => boolean;
}

/**
 * Error correction level M: the usual choice for a printed code that will get
 * smudged by a thumb but is not going on a truck.
 */
export function qrMatrix(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const data = qr.modules.data;
  return {
    size,
    dark: (x: number, y: number) => Boolean(data[y * size + x]),
  };
}

export interface QrSvgOptions {
  /** Overall SVG size in px. */
  sizePx?: number;
  /** Quiet zone in modules. The spec says 4; less and some scanners sulk. */
  margin?: number;
  dark?: string;
  light?: string;
}

/**
 * QR as an inline SVG string.
 *
 * Hand-built rather than `QRCode.toString`, because this is embedded in the
 * dashboard and printed at large sizes: one `<path>` of rectangles scales
 * perfectly and carries no `<style>` block or generator comment.
 */
export function qrSvg(text: string, options: QrSvgOptions = {}): string {
  const { sizePx = 240, margin = 4, dark = "#2B241C", light = "none" } = options;
  const matrix = qrMatrix(text);
  const total = matrix.size + margin * 2;
  let path = "";
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.dark(x, y)) path += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
  }
  const background =
    light === "none" ? "" : `<rect width="${total}" height="${total}" fill="${light}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" ` +
    `viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="Menu QR code">` +
    `${background}<path d="${path}" fill="${dark}"/></svg>`
  );
}

/** Ink and paper as PDF-friendly 0-1 RGB, straight from DESIGN.md. */
const INK = { r: 0x2b / 255, g: 0x24 / 255, b: 0x1c / 255 };
const PAPER = { r: 0xf5 / 255, g: 0xef / 255, b: 0xe3 / 255 };
const HAIRLINE = { r: 0xe4 / 255, g: 0xda / 255, b: 0xc8 / 255 };

export type PrintFormat = "table_tent" | "window_card";

export interface PrintableOptions {
  restaurantName: string;
  url: string;
  /** e.g. "Dinner" — printed under the headline when the QR pins one menu. */
  menuName?: string | null;
  /** Optional line of small print: address, "Table 4", etc. */
  footnote?: string | null;
}

export const PRINT_SIZES: Record<PrintFormat, { widthIn: number; heightIn: number; label: string }> = {
  // A4/Letter-friendly tent that folds to a 4×6 face.
  table_tent: { widthIn: 4, heightIn: 6, label: "Table tent, 4 × 6 in" },
  window_card: { widthIn: 5, heightIn: 7, label: "Window card, 5 × 7 in" },
};

/**
 * Draw a QR grid into a content stream, snapped to whole device units so no
 * module lands on a half pixel at print resolution.
 */
function drawQr(
  content: PdfContent,
  text: string,
  x: number,
  y: number,
  sizePt: number,
  margin = 4,
): void {
  const matrix = qrMatrix(text);
  const total = matrix.size + margin * 2;
  const module = sizePt / total;
  content.fillRgb(INK.r, INK.g, INK.b);
  for (let my = 0; my < matrix.size; my++) {
    for (let mx = 0; mx < matrix.size; mx++) {
      if (!matrix.dark(mx, my)) continue;
      // PDF's origin is bottom-left; QR rows count downward.
      const px = x + (mx + margin) * module;
      const py = y + sizePt - (my + margin + 1) * module;
      content.rect(px, py, module + 0.02, module + 0.02);
    }
  }
}

/** Crop marks in the four corners, 0.25in in from the trim. */
function cropMarks(content: PdfContent, w: number, h: number): void {
  const inset = inches(0.18);
  const len = inches(0.12);
  content.strokeRgb(INK.r, INK.g, INK.b);
  const corners: [number, number, number, number][] = [
    [inset, inset, inset + len, inset],
    [inset, inset, inset, inset + len],
    [w - inset - len, inset, w - inset, inset],
    [w - inset, inset, w - inset, inset + len],
    [inset, h - inset, inset + len, h - inset],
    [inset, h - inset - len, inset, h - inset],
    [w - inset - len, h - inset, w - inset, h - inset],
    [w - inset, h - inset - len, w - inset, h - inset],
  ];
  for (const [x1, y1, x2, y2] of corners) content.line(x1, y1, x2, y2, 0.4);
}

/**
 * One printable page. Typography follows DESIGN.md's roles as closely as base-14
 * fonts allow: a large name, a Label instruction, the QR as the hero, and the
 * URL in small type so a guest with a dead camera can still type it.
 */
function printablePage(format: PrintFormat, options: PrintableOptions) {
  const { widthIn, heightIn } = PRINT_SIZES[format];
  const w = inches(widthIn);
  const h = inches(heightIn);
  const gutter = inches(0.5);
  const content = new PdfContent();

  content.fillRgb(PAPER.r, PAPER.g, PAPER.b).rect(0, 0, w, h);
  cropMarks(content, w, h);

  // Restaurant name, wrapped, top-anchored.
  const nameSize = format === "window_card" ? 26 : 22;
  const nameLines = wrapText(options.restaurantName, nameSize, w - gutter * 2, "Helvetica-Bold");
  let cursorY = h - gutter - nameSize;
  content.fillRgb(INK.r, INK.g, INK.b);
  for (const line of nameLines.slice(0, 3)) {
    content.textCentred(w / 2, cursorY, line, nameSize, "Helvetica-Bold");
    cursorY -= nameSize * 1.15;
  }

  if (options.menuName) {
    cursorY -= 6;
    content.fillRgb(0x6e / 255, 0x63 / 255, 0x55 / 255);
    content.label(w / 2, cursorY, options.menuName, 9, 0.9);
    content.fillRgb(INK.r, INK.g, INK.b);
    cursorY -= 14;
  }

  // Hairline rule under the head.
  cursorY -= 10;
  content.strokeRgb(HAIRLINE.r, HAIRLINE.g, HAIRLINE.b);
  content.line(gutter, cursorY, w - gutter, cursorY, 1);

  // The QR, as large as the page allows.
  const qrSize = Math.min(w - gutter * 2, cursorY - inches(1.5));
  const qrX = (w - qrSize) / 2;
  const qrY = cursorY - inches(0.4) - qrSize;
  drawQr(content, options.url, qrX, qrY, qrSize);

  // Instruction, then the URL, then the footnote.
  content.fillRgb(INK.r, INK.g, INK.b);
  content.label(w / 2, qrY - inches(0.34), "Scan for the menu", 10, 1.1);

  const urlText = options.url.replace(/^https?:\/\//, "");
  const urlSize = Math.min(11, ((w - gutter * 2) / Math.max(1, textWidth(urlText, 11))) * 11);
  content.fillRgb(0x6e / 255, 0x63 / 255, 0x55 / 255);
  content.textCentred(w / 2, qrY - inches(0.55), urlText, urlSize);

  if (options.footnote) {
    content.fillRgb(0xa2 / 255, 0x96 / 255, 0x8a / 255);
    content.textCentred(w / 2, inches(0.34), options.footnote, 8);
  }

  return { widthPt: w, heightPt: h, content: content.toString() };
}

/** A single printable, as PDF bytes. */
export function printablePdf(format: PrintFormat, options: PrintableOptions): Uint8Array {
  return buildPdf([printablePage(format, options)], {
    title: `${options.restaurantName} — ${PRINT_SIZES[format].label}`,
    author: options.restaurantName,
  });
}

/**
 * Both printables in one file — what an owner actually wants to send to the
 * print shop: page 1 the table tent, page 2 the window card.
 */
export function printPackPdf(options: PrintableOptions): Uint8Array {
  return buildPdf(
    [printablePage("table_tent", options), printablePage("window_card", options)],
    { title: `${options.restaurantName} — MenuLift print pack`, author: options.restaurantName },
  );
}
