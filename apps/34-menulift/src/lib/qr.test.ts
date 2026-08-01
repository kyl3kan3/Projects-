import assert from "node:assert/strict";
import { test } from "node:test";
import { PRINT_SIZES, printPackPdf, printablePdf, qrMatrix, qrSvg } from "./qr";
import { pdfString, textWidth, wrapText } from "./pdf";

const URL_UNDER_TEST = "https://menulift.app/m/rossi-fishtown";

test("a QR matrix has the finder patterns a scanner looks for", () => {
  const m = qrMatrix(URL_UNDER_TEST);
  assert.ok(m.size >= 21 && m.size % 4 === 1, `unexpected QR size ${m.size}`);
  // Top-left finder: 7x7 with a dark ring and a dark 3x3 core.
  for (let i = 0; i < 7; i++) {
    assert.equal(m.dark(i, 0), true, `top edge module ${i}`);
    assert.equal(m.dark(0, i), true, `left edge module ${i}`);
  }
  assert.equal(m.dark(1, 1), false, "the ring has a light gap");
  assert.equal(m.dark(3, 3), true, "the core is dark");
  // Top-right and bottom-left finders exist too.
  assert.equal(m.dark(m.size - 1, 0), true);
  assert.equal(m.dark(0, m.size - 1), true);
});

test("the QR is deterministic for the same URL and differs for another", () => {
  const a = qrSvg(URL_UNDER_TEST);
  const b = qrSvg(URL_UNDER_TEST);
  const c = qrSvg("https://menulift.app/m/rossi-kensington");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("the SVG is self-contained and sized by viewBox, not pixels", () => {
  const svg = qrSvg(URL_UNDER_TEST, { sizePx: 320, margin: 4 });
  const size = qrMatrix(URL_UNDER_TEST).size;
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, new RegExp(`viewBox="0 0 ${size + 8} ${size + 8}"`));
  assert.match(svg, /width="320" height="320"/);
  assert.match(svg, /fill="#2B241C"/);
  assert.ok(!svg.includes("<style"), "no style block to fight the page's CSS");
  assert.match(svg, /aria-label="Menu QR code"/);
});

test("a table tent is a real single-page PDF at 4x6 inches", () => {
  const bytes = printablePdf("table_tent", {
    restaurantName: "Rossi & Co",
    url: URL_UNDER_TEST,
    menuName: "Dinner",
    footnote: "1420 Frankford Ave, Philadelphia",
  });
  const text = Buffer.from(bytes).toString("latin1");
  assert.match(text, /^%PDF-1\.4\n/);
  assert.ok(text.endsWith("%%EOF\n"));
  assert.match(text, /\/MediaBox \[0 0 288 432\]/);
  assert.match(text, /\/Count 1/);
  assert.equal(PRINT_SIZES.table_tent.widthIn * 72, 288);
});

test("the print pack is two pages: tent then window card", () => {
  const text = Buffer.from(
    printPackPdf({ restaurantName: "Rossi & Co", url: URL_UNDER_TEST }),
  ).toString("latin1");
  assert.match(text, /\/Count 2/);
  assert.match(text, /\/MediaBox \[0 0 288 432\]/);
  assert.match(text, /\/MediaBox \[0 0 360 504\]/);
});

test("every xref offset points at the object it claims", () => {
  const bytes = printablePdf("window_card", {
    restaurantName: "Rossi & Co",
    url: URL_UNDER_TEST,
  });
  const text = Buffer.from(bytes).toString("latin1");

  const startxref = Number(/startxref\n(\d+)\n/.exec(text)![1]);
  assert.equal(text.slice(startxref, startxref + 4), "xref", "startxref lands on the table");

  const table = text.slice(startxref);
  const entries = [...table.matchAll(/^(\d{10}) (\d{5}) ([nf]) $/gm)];
  assert.ok(entries.length >= 8, `expected object entries, found ${entries.length}`);
  let checked = 0;
  entries.forEach((entry, index) => {
    if (entry[3] !== "n") return;
    const offset = Number(entry[1]);
    assert.match(
      text.slice(offset, offset + 12),
      new RegExp(`^${index} 0 obj`),
      `object ${index} is not at offset ${offset}`,
    );
    checked += 1;
  });
  assert.ok(checked >= 7, "checked the real objects, not just the free head");
});

test("a name with PDF metacharacters cannot corrupt the file", () => {
  const bytes = printablePdf("table_tent", {
    restaurantName: "Rossi (Fishtown) \\ Co",
    url: URL_UNDER_TEST,
    footnote: "Ask about the (nightly) special",
  });
  const text = Buffer.from(bytes).toString("latin1");
  assert.match(text, /Rossi \\\(Fishtown\\\) \\\\ Co/);

  // Balanced parentheses in every text literal, i.e. nothing escaped the string.
  for (const [, literal] of text.matchAll(/\((.*?)\) Tj/g)) {
    let depth = 0;
    for (let i = 0; i < literal.length; i++) {
      if (literal[i] === "\\") {
        i += 1;
        continue;
      }
      if (literal[i] === "(") depth += 1;
      if (literal[i] === ")") depth -= 1;
      assert.ok(depth >= 0, `unbalanced literal: ${literal}`);
    }
    assert.equal(depth, 0, `unbalanced literal: ${literal}`);
  }
});

test("pdfString escapes and transliterates without emitting raw high bytes", () => {
  assert.equal(pdfString("Café"), "Caf\\351");
  assert.equal(pdfString("a(b)c\\d"), "a\\(b\\)c\\\\d");
  assert.equal(pdfString("“curly” — dash"), '"curly" - dash');
  assert.equal(pdfString("🍗 wings"), "? wings");
  assert.equal(pdfString("Crème brûlée"), "Cr\\350me br\\373l\\351e");
});

test("text metrics and wrapping are usable for centring", () => {
  assert.ok(textWidth("Rossi & Co", 24, "Helvetica-Bold") > 0);
  assert.ok(
    textWidth("iiii", 24) < textWidth("MMMM", 24),
    "the width table is per-glyph, not a fixed average",
  );
  const lines = wrapText("The Half Chicken with chili honey and pickled fennel", 12, 120);
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(textWidth(line, 12) <= 120 || !line.includes(" "));
});

test("an unusually long restaurant name still produces a valid PDF", () => {
  const bytes = printablePdf("table_tent", {
    restaurantName: "The Very Long Named Restaurant And Oyster Bar Of Northern Liberties",
    url: URL_UNDER_TEST,
  });
  const text = Buffer.from(bytes).toString("latin1");
  assert.match(text, /^%PDF-1\.4/);
  assert.ok(text.endsWith("%%EOF\n"));
  assert.ok(bytes.byteLength > 2000);
});
