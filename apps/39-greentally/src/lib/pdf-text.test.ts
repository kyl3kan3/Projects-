import test from "node:test";
import assert from "node:assert/strict";
import { looksLikePdf, parseToUnicode, pdfText } from "./pdf-text";
import { readBillText } from "./bill-text";

/* ------------------------------------------------------------------ fixture --- */

/**
 * A hand-built PDF in the shape every modern generator emits: a Type0 font with
 * Identity-H encoding, so the content stream carries glyph indices rather than
 * characters, plus the `/ToUnicode` CMap that maps them back.
 *
 * The important detail is the mid-number `Td`: real generators kern with it, and a reader
 * that treats every `Td` as a line break splits "4,110" into "4,1" and "10". The bill
 * below is built to reproduce exactly that, because the naive reader reported 41 kWh for
 * a 4,110 kWh bill and nothing downstream would have caught it.
 */
const GLYPHS = " ,.-0123456789:CDEMPSTWabcdeghiklmnoprstuvy";

function glyphCode(ch: string): number {
  const i = GLYPHS.indexOf(ch);
  if (i === -1) throw new Error(`fixture has no glyph for ${JSON.stringify(ch)}`);
  return i + 1;
}

function hexOf(text: string): string {
  return [...text]
    .map((ch) => glyphCode(ch).toString(16).padStart(4, "0"))
    .join("")
    .toUpperCase();
}

function toUnicodeCMap(): string {
  const pairs = [...GLYPHS]
    .map(
      (ch, i) =>
        `<${(i + 1).toString(16).padStart(4, "0").toUpperCase()}> <${ch
          .charCodeAt(0)
          .toString(16)
          .padStart(4, "0")
          .toUpperCase()}>`,
    )
    .join("\n");
  return [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CMapName /Test def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    `${GLYPHS.length} beginbfchar`,
    pairs,
    "endbfchar",
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
}

interface Show {
  text: string;
  /** Vertical move applied *before* showing: 0 is a kern, negative starts a new line. */
  dy: number;
}

function buildPdf(shows: Show[], opts: { withToUnicode?: boolean } = {}): Uint8Array {
  const withToUnicode = opts.withToUnicode !== false;
  const content = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
    ...shows.map((s) => `${s.dy === 0 ? "0.4 0" : `0 ${s.dy}`} Td <${hexOf(s.text)}> Tj`),
    "ET",
  ].join("\n");
  const cmap = toUnicodeCMap();

  const objects: string[] = [
    "<</Type /Catalog /Pages 2 0 R>>",
    "<</Type /Pages /Kids [3 0 R] /Count 1>>",
    `<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources <</Font <</F1 4 0 R>>>> /Contents 6 0 R>>`,
    `<</Type /Font /Subtype /Type0 /BaseFont /AAAAAA+Test /Encoding /Identity-H /DescendantFonts [5 0 R]${
      withToUnicode ? " /ToUnicode 7 0 R" : ""
    }>>`,
    "<</Type /Font /Subtype /CIDFontType2 /BaseFont /AAAAAA+Test>>",
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    `<</Length ${cmap.length}>>\nstream\n${cmap}\nendstream`,
  ];

  const body = objects.map((o, i) => `${i + 1} 0 obj\n${o}\nendobj\n`).join("");
  return new Uint8Array(Buffer.from(`%PDF-1.7\n${body}trailer\n<</Root 1 0 R>>\n%%EOF\n`, "latin1"));
}

/* -------------------------------------------------------------------- tests --- */

test("a PDF is recognised by its header, and other bytes are not", () => {
  assert.equal(looksLikePdf(new Uint8Array(Buffer.from("%PDF-1.7\n"))), true);
  assert.equal(looksLikePdf(new Uint8Array(Buffer.from("\x89PNG\r\n"))), false);
  assert.equal(pdfText(new Uint8Array(Buffer.from("not a pdf"))), "");
});

test("a subset font's glyph indices are decoded through its ToUnicode CMap", () => {
  const text = pdfText(
    buildPdf([
      { text: "Consolidated Edison", dy: 0 },
      { text: "Service Period: Mar 1. 2025 - Mar 31. 2025", dy: -14 },
      { text: "Total kWh used 4", dy: -14 },
    ]),
  );
  assert.match(text, /Consolidated Edison/);
  assert.match(text, /Total kWh used 4/);
});

test("a mid-number Td is a kern, not a line break — the 4,110 read as 41 bug", () => {
  const text = pdfText(
    buildPdf([
      { text: "Total kWh used 4,1", dy: 0 },
      { text: "10", dy: 0 },
      { text: "Delivery charges", dy: -14 },
    ]),
  );
  assert.match(text, /Total kWh used 4,110/, `got: ${JSON.stringify(text)}`);
  assert.equal(text.includes("4,1\n"), false, "the number must not be split across lines");
  // And the reader on top of it must see the whole quantity.
  const reading = readBillText(text);
  assert.equal(reading.quantity?.value.quantity, 4110);
});

test("a vertical Td does break the line", () => {
  const text = pdfText(
    buildPdf([
      { text: "Total kWh used 4110", dy: 0 },
      { text: "Delivery charges", dy: -14 },
    ]),
  );
  assert.deepEqual(text.split("\n"), ["Total kWh used 4110", "Delivery charges"]);
});

test("a two-byte font with no ToUnicode yields nothing rather than glyph soup", () => {
  const text = pdfText(
    buildPdf([{ text: "Total kWh used 4110", dy: 0 }], { withToUnicode: false }),
  );
  // Better an empty text layer — which routes the document to review — than a
  // confident-looking wrong number decoded from glyph indices.
  assert.equal(text, "");
});

test("an image-only PDF has no text layer, and says so by returning nothing", () => {
  const bytes = new Uint8Array(
    Buffer.from(
      "%PDF-1.7\n1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n" +
        "2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n" +
        "3 0 obj\n<</Type /Page /Parent 2 0 R /Contents 4 0 R>>\nendobj\n" +
        "4 0 obj\n<</Length 20 /Filter /DCTDecode>>\nstream\nnot-really-a-jpeg\nendstream\nendobj\n" +
        "trailer\n<</Root 1 0 R>>\n%%EOF\n",
      "latin1",
    ),
  );
  assert.equal(pdfText(bytes), "");
});

test("bfrange with a base destination expands across the range", () => {
  const cmap = parseToUnicode(
    ["begincmap", "1 beginbfrange", "<0010> <0019> <0030>", "endbfrange", "endcmap"].join("\n"),
  );
  assert.equal(cmap.get(0x10), "0");
  assert.equal(cmap.get(0x19), "9");
  assert.equal(cmap.get(0x1a), undefined);
});

test("bfrange with an array destination maps each code in turn", () => {
  const cmap = parseToUnicode(
    [
      "begincmap",
      "1 beginbfrange",
      "<0003> <0005> [<0041> <0042> <0043>]",
      "endbfrange",
      "endcmap",
    ].join("\n"),
  );
  assert.equal(cmap.get(3), "A");
  assert.equal(cmap.get(4), "B");
  assert.equal(cmap.get(5), "C");
});

test("bfchar maps single codes", () => {
  const cmap = parseToUnicode(
    ["begincmap", "2 beginbfchar", "<0003> <0020>", "<0024> <0041>", "endbfchar", "endcmap"].join(
      "\n",
    ),
  );
  assert.equal(cmap.get(3), " ");
  assert.equal(cmap.get(0x24), "A");
});
