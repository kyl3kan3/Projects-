/**
 * A thin layout layer over pdf-lib: text with wrapping, rules, boxes, and a
 * page-break helper. Shared by the OSHA form renderers and the binder.
 *
 * The PDFs are the light artifacts in a dark product — DESIGN.md says so
 * explicitly. They are printed, faxed, and stapled into bid packets, so they are
 * black on white with Helvetica and no colour except the two semantic marks.
 */

import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from "pdf-lib";

export const INK = rgb(0.07, 0.07, 0.06);
export const MUTED = rgb(0.42, 0.42, 0.4);
export const HAIRLINE = rgb(0.72, 0.72, 0.7);
export const RED = rgb(0.66, 0.24, 0.18);

export const LETTER_PORTRAIT: [number, number] = [612, 792];
export const LETTER_LANDSCAPE: [number, number] = [792, 612];

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
  monoBold: PDFFont;
}

export interface Doc {
  pdf: PDFDocument;
  fonts: Fonts;
}

export async function createDoc(title: string, subject: string): Promise<Doc> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setSubject(subject);
  pdf.setProducer("SafetyDeck");
  pdf.setCreator("SafetyDeck");
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
    monoBold: await pdf.embedFont(StandardFonts.CourierBold),
  };
  return { pdf, fonts };
}

export interface TextOpts {
  size?: number;
  font?: PDFFont;
  color?: RGB;
  maxWidth?: number;
  lineHeight?: number;
}

/** Break `text` into lines that fit `maxWidth` at `size`. */
export function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // A single word longer than the column gets hard-broken rather than
    // silently overflowing the cell.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = "";
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    } else {
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Draw text at a top-left origin; returns the height consumed. */
export function drawText(
  page: PDFPage,
  fonts: Fonts,
  text: string,
  x: number,
  yTop: number,
  opts: TextOpts = {},
): number {
  const size = opts.size ?? 9;
  const font = opts.font ?? fonts.regular;
  const color = opts.color ?? INK;
  const lineHeight = opts.lineHeight ?? size * 1.32;
  const lines = opts.maxWidth ? wrapText(text, font, size, opts.maxWidth) : [text];
  lines.forEach((line, i) => {
    page.drawText(line, {
      x,
      y: yTop - size - i * lineHeight,
      size,
      font,
      color,
    });
  });
  return lines.length * lineHeight;
}

export function hairline(page: PDFPage, x: number, y: number, width: number, color = HAIRLINE) {
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness: 0.7,
    color,
  });
}

export function vrule(page: PDFPage, x: number, yTop: number, height: number, color = HAIRLINE) {
  page.drawLine({
    start: { x, y: yTop },
    end: { x, y: yTop - height },
    thickness: 0.7,
    color,
  });
}

export function box(
  page: PDFPage,
  x: number,
  yTop: number,
  width: number,
  height: number,
  color = HAIRLINE,
) {
  page.drawRectangle({
    x,
    y: yTop - height,
    width,
    height,
    borderColor: color,
    borderWidth: 0.7,
  });
}

/** A filled "X" style mark for a checkbox column. */
export function mark(page: PDFPage, fonts: Fonts, x: number, yTop: number, glyph = "X") {
  page.drawText(glyph, { x, y: yTop - 9, size: 9, font: fonts.bold, color: INK });
}

export interface FooterInfo {
  left: string;
  right: string;
}

export function drawFooter(
  page: PDFPage,
  fonts: Fonts,
  info: FooterInfo,
  margin = 36,
): void {
  const { width } = page.getSize();
  hairline(page, margin, 30, width - margin * 2);
  page.drawText(info.left, { x: margin, y: 18, size: 7, font: fonts.regular, color: MUTED });
  const w = fonts.regular.widthOfTextAtSize(info.right, 7);
  page.drawText(info.right, {
    x: width - margin - w,
    y: 18,
    size: 7,
    font: fonts.regular,
    color: MUTED,
  });
}

/**
 * Render captured signature strokes into a PDF page.
 *
 * The stored path is SVG path data in the capture pad's own pixel space; pdf-lib
 * treats `drawSvgPath` as y-down from the given origin, which is exactly the
 * space the pad captured in, so the only transform needed is a uniform scale.
 */
export function drawSignature(
  page: PDFPage,
  path: string,
  opts: { x: number; yTop: number; width: number; height: number; sourceWidth: number; sourceHeight: number },
): void {
  if (!path.trim()) return;
  const scale = Math.min(opts.width / opts.sourceWidth, opts.height / opts.sourceHeight);
  try {
    page.drawSvgPath(path, {
      x: opts.x,
      y: opts.yTop,
      scale,
      borderColor: INK,
      borderWidth: 1.1,
    });
  } catch {
    // A malformed path must never take down a binder export; the row still
    // prints with its name, time and device, which is the evidentiary part.
  }
}
