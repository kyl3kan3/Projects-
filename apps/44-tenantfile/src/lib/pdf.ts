/**
 * A small PDF writer.
 *
 * Why hand-rolled: the manifest originally reached for `@react-pdf/renderer`,
 * which the shared toolchain refuses to install (it pulls a browser-class
 * dependency tree). The File export and the sealed lease are the two documents a
 * landlord may one day hand to a judge, so they had to work — and what they need
 * is typeset text, hairline rules, right-aligned mono amounts, and the occasional
 * photograph. That is about 300 lines of PDF 1.4, with no dependency and nothing
 * to keep up to date.
 *
 * Deliberately not supported: font embedding (the three base-14 faces are used,
 * which every reader has), vector graphics, links, and encryption.
 */

export type PdfBlock =
  | { type: "title"; text: string }
  | { type: "heading"; text: string }
  | { type: "label"; text: string }
  | { type: "body"; text: string }
  | { type: "mono"; text: string }
  | { type: "row"; left: string; right: string; muted?: boolean; strong?: boolean }
  | { type: "bullet"; text: string }
  | { type: "rule" }
  | { type: "space"; height: number }
  | { type: "image"; jpeg: Buffer; caption?: string }
  | { type: "pagebreak" };

export interface PdfOptions {
  title: string;
  subtitle?: string;
  /** Repeated at the foot of every page, left of the page number. */
  footer?: string;
  blocks: PdfBlock[];
}

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = 62; // room for the footer

const F_REGULAR = "F1";
const F_BOLD = "F2";
const F_MONO = "F3";

/* ---- text metrics -------------------------------------------------------- */

/**
 * Helvetica advance widths (per 1000 units) for the printable ASCII range,
 * enough for correct wrapping. Courier is monospaced at 600.
 */
const HELV_WIDTHS: Record<string, number> = (() => {
  const w: Record<string, number> = {};
  const set = (chars: string, width: number) => {
    for (const c of chars) w[c] = width;
  };
  set(" !", 278);
  set('"', 355);
  set("#$", 556);
  set("%", 889);
  set("&", 667);
  set("'", 191);
  set("()", 333);
  set("*", 389);
  set("+", 584);
  set(",.", 278);
  set("-", 333);
  set("/", 278);
  set("0123456789", 556);
  set(":;", 278);
  set("<=>", 584);
  set("?", 556);
  set("@", 1015);
  set("ABDEHKNPRSVXY", 667);
  set("C", 722);
  set("FZ", 611);
  set("G", 778);
  set("IJ", 278);
  set("LT", 611);
  set("MOQ", 778);
  set("U", 722);
  set("W", 944);
  set("[]", 278);
  set("\\", 278);
  set("^", 469);
  set("_", 556);
  set("`", 333);
  set("abcdeghknopqsu", 556);
  set("f", 278);
  set("ij", 222);
  set("l", 222);
  set("mw", 833);
  set("r", 333);
  set("t", 278);
  set("vxyz", 500);
  set("{}", 334);
  set("|", 260);
  set("~", 584);
  return w;
})();

function charWidth(ch: string, font: string): number {
  if (font === F_MONO) return 600;
  const base = HELV_WIDTHS[ch] ?? 556;
  return font === F_BOLD ? Math.round(base * 1.06) : base;
}

export function textWidth(text: string, font: string, size: number): number {
  let total = 0;
  for (const ch of text) total += charWidth(ch, font);
  return (total * size) / 1000;
}

function wrap(text: string, font: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (textWidth(candidate, font, size) <= maxWidth || current === "") {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/* ---- string encoding ----------------------------------------------------- */

/**
 * WinAnsiEncoding code points for the typographic characters this product
 * actually sets. Written as escapes, not literal glyphs, so that nobody
 * "tidies" the file into UTF-8 later and silently breaks every export.
 */
const WINANSI: Record<string, string> = {
  "\u2014": "\u0097", // em dash
  "\u2013": "\u0096", // en dash
  "\u00b7": "\u00b7", // middle dot, the product's separator
  "\u2019": "\u0092",
  "\u2018": "\u0091",
  "\u201c": "\u0093",
  "\u201d": "\u0094",
  "\u2026": "\u0085", // ellipsis
  "\u2022": "\u0095", // bullet
  "\u00d7": "\u00d7", // multiplication sign, as in "3.4x RENT"
  "\u00a0": " ",
};

function encodeText(text: string): string {
  let out = "";
  for (const ch of text) {
    const mapped = WINANSI[ch] ?? ch;
    const code = mapped.codePointAt(0)!;
    out += code <= 255 ? mapped : "?";
  }
  return out.replace(/([\\()])/g, "\\$1");
}

/* ---- JPEG dimensions ----------------------------------------------------- */

export interface JpegInfo {
  width: number;
  height: number;
  components: number;
}

/**
 * Read a JPEG's frame header. Returns null for anything that is not a baseline
 * or progressive JPEG, which is the signal to list the photo as a reference line
 * instead of embedding it.
 */
export function readJpeg(bytes: Buffer): JpegInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = bytes.readUInt16BE(i + 2);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      return {
        height: bytes.readUInt16BE(i + 5),
        width: bytes.readUInt16BE(i + 7),
        components: bytes[i + 9],
      };
    }
    i += 2 + length;
  }
  return null;
}

/* ---- the renderer -------------------------------------------------------- */

interface Op {
  content: string;
  images: { name: string; jpeg: Buffer; info: JpegInfo }[];
}

class PageBuilder {
  content = "";
  images: Op["images"] = [];
  y = PAGE_H - MARGIN;

  text(x: number, y: number, text: string, font: string, size: number, gray = 0) {
    this.content += `BT /${font} ${size} Tf ${gray} g 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${encodeText(text)}) Tj ET\n`;
  }

  rule(y: number, gray = 0.86) {
    this.content += `${gray} G 0.7 w ${MARGIN} ${y.toFixed(2)} m ${PAGE_W - MARGIN} ${y.toFixed(2)} l S\n`;
  }

  image(name: string, x: number, y: number, w: number, h: number) {
    this.content += `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${name} Do Q\n`;
  }
}

export function renderPdf(opts: PdfOptions): Buffer {
  const pages: PageBuilder[] = [];
  let page = new PageBuilder();
  pages.push(page);
  let imageCount = 0;

  const newPage = () => {
    page = new PageBuilder();
    pages.push(page);
  };

  const need = (height: number) => {
    if (page.y - height < BOTTOM) newPage();
  };

  // Cover block: the document's own title, then a hairline.
  page.y -= 6;
  for (const line of wrap(opts.title, F_BOLD, 20, CONTENT_W)) {
    page.text(MARGIN, page.y, line, F_BOLD, 20);
    page.y -= 26;
  }
  if (opts.subtitle) {
    for (const line of wrap(opts.subtitle, F_REGULAR, 10.5, CONTENT_W)) {
      page.text(MARGIN, page.y, line, F_REGULAR, 10.5, 0.42);
      page.y -= 14;
    }
  }
  page.y -= 8;
  page.rule(page.y);
  page.y -= 20;

  for (const block of opts.blocks) {
    switch (block.type) {
      case "pagebreak":
        newPage();
        break;

      case "space":
        page.y -= block.height;
        break;

      case "rule":
        need(14);
        page.y -= 4;
        page.rule(page.y);
        page.y -= 12;
        break;

      case "title": {
        need(34);
        for (const line of wrap(block.text, F_BOLD, 15, CONTENT_W)) {
          need(20);
          page.text(MARGIN, page.y, line, F_BOLD, 15);
          page.y -= 20;
        }
        page.y -= 6;
        break;
      }

      case "heading": {
        need(24);
        for (const line of wrap(block.text, F_BOLD, 11.5, CONTENT_W)) {
          need(18);
          page.text(MARGIN, page.y, line, F_BOLD, 11.5);
          page.y -= 16;
        }
        page.y -= 2;
        break;
      }

      case "label": {
        need(16);
        page.text(MARGIN, page.y, block.text.toUpperCase(), F_BOLD, 8, 0.45);
        page.y -= 14;
        break;
      }

      case "body": {
        for (const line of wrap(block.text, F_REGULAR, 10.5, CONTENT_W)) {
          need(15);
          page.text(MARGIN, page.y, line, F_REGULAR, 10.5, 0.12);
          page.y -= 14.5;
        }
        page.y -= 3;
        break;
      }

      case "bullet": {
        const indent = 14;
        const lines = wrap(block.text, F_REGULAR, 10.5, CONTENT_W - indent);
        lines.forEach((line, i) => {
          need(15);
          if (i === 0) page.text(MARGIN, page.y, "–", F_REGULAR, 10.5, 0.42);
          page.text(MARGIN + indent, page.y, line, F_REGULAR, 10.5, 0.12);
          page.y -= 14.5;
        });
        break;
      }

      case "mono": {
        for (const line of wrap(block.text, F_MONO, 9.5, CONTENT_W)) {
          need(14);
          page.text(MARGIN, page.y, line, F_MONO, 9.5, 0.12);
          page.y -= 13.5;
        }
        page.y -= 3;
        break;
      }

      case "row": {
        need(17);
        const size = 10;
        const rightWidth = textWidth(block.right, F_MONO, size);
        const leftMax = CONTENT_W - rightWidth - 14;
        const leftLines = wrap(block.left, block.strong ? F_BOLD : F_REGULAR, size, leftMax);
        const gray = block.muted ? 0.48 : 0.12;
        leftLines.forEach((line, i) => {
          need(15);
          page.text(MARGIN, page.y, line, block.strong ? F_BOLD : F_REGULAR, size, gray);
          if (i === 0) {
            page.text(PAGE_W - MARGIN - rightWidth, page.y, block.right, F_MONO, size, gray);
          }
          page.y -= 14.5;
        });
        break;
      }

      case "image": {
        const info = readJpeg(block.jpeg);
        if (!info) {
          // Not a JPEG we can embed — say so rather than dropping the evidence.
          for (const line of wrap("[photo attached; not embeddable in this export]", F_REGULAR, 9.5, CONTENT_W)) {
            need(14);
            page.text(MARGIN, page.y, line, F_REGULAR, 9.5, 0.5);
            page.y -= 13;
          }
          break;
        }
        const maxW = Math.min(CONTENT_W, 240);
        const scale = Math.min(maxW / info.width, 1);
        const w = info.width * scale;
        const h = info.height * scale;
        const captionH = block.caption ? 14 : 0;
        if (page.y - (h + captionH + 10) < BOTTOM) newPage();
        const name = `Im${++imageCount}`;
        page.images.push({ name, jpeg: block.jpeg, info });
        page.y -= h;
        page.image(name, MARGIN, page.y, w, h);
        page.y -= 6;
        if (block.caption) {
          page.text(MARGIN, page.y, block.caption, F_REGULAR, 8.5, 0.5);
          page.y -= 12;
        }
        page.y -= 6;
        break;
      }
    }
  }

  // Footers, once the page count is known.
  pages.forEach((p, i) => {
    const label = `${i + 1} of ${pages.length}`;
    p.rule(BOTTOM + 16, 0.9);
    if (opts.footer) p.text(MARGIN, BOTTOM, opts.footer, F_REGULAR, 8, 0.5);
    p.text(PAGE_W - MARGIN - textWidth(label, F_MONO, 8), BOTTOM, label, F_MONO, 8, 0.5);
  });

  return assemble(pages);
}

/* ---- object assembly ----------------------------------------------------- */

function assemble(pages: PageBuilder[]): Buffer {
  const objects: Buffer[] = [];
  const push = (body: string | Buffer): number => {
    objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1"));
    return objects.length; // 1-based object number
  };

  // Reserve 1 = Catalog, 2 = Pages.
  push("");
  push("");

  const fontRegular = push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBold = push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const fontMono = push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");

  const pageIds: number[] = [];
  for (const p of pages) {
    const xobjects: string[] = [];
    for (const img of p.images) {
      const colorSpace =
        img.info.components === 1 ? "/DeviceGray" : img.info.components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
      const header =
        `<< /Type /XObject /Subtype /Image /Width ${img.info.width} /Height ${img.info.height} ` +
        `/ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>\nstream\n`;
      const id = push(Buffer.concat([Buffer.from(header, "latin1"), img.jpeg, Buffer.from("\nendstream", "latin1")]));
      xobjects.push(`/${img.name} ${id} 0 R`);
    }

    const stream = Buffer.from(p.content, "latin1");
    const contentId = push(
      Buffer.concat([
        Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, "latin1"),
        stream,
        Buffer.from("\nendstream", "latin1"),
      ]),
    );

    const resources =
      `<< /Font << /${F_REGULAR} ${fontRegular} 0 R /${F_BOLD} ${fontBold} 0 R /${F_MONO} ${fontMono} 0 R >>` +
      (xobjects.length ? ` /XObject << ${xobjects.join(" ")} >>` : "") +
      " >>";

    pageIds.push(
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources ${resources} /Contents ${contentId} 0 R >>`,
      ),
    );
  }

  objects[0] = Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1");
  objects[1] = Buffer.from(
    `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
    "latin1",
  );

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let offset = chunks[0].length;
  const offsets: number[] = [];

  objects.forEach((body, i) => {
    const head = Buffer.from(`${i + 1} 0 obj\n`, "latin1");
    const tail = Buffer.from("\nendobj\n", "latin1");
    offsets.push(offset);
    const chunk = Buffer.concat([head, body, tail]);
    chunks.push(chunk);
    offset += chunk.length;
  });

  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += `${String(o).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));

  return Buffer.concat(chunks);
}
