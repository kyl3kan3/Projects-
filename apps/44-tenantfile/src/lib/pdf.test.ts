import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readJpeg, renderPdf, textWidth } from "@/lib/pdf";

/** A 4x3 baseline JPEG, built by hand: SOI, APP0, SOF0, minimal scan, EOI. */
function tinyJpeg(width = 4, height = 3, components = 3): Buffer {
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffd8, 0); // SOI
  sof.writeUInt16BE(0xffe0, 2); // APP0
  sof.writeUInt16BE(2, 4); // APP0 length — the length field and nothing else
  sof.writeUInt16BE(0xffc0, 6); // SOF0
  sof.writeUInt16BE(11, 8); // SOF0 length
  sof.writeUInt8(8, 10); // precision
  sof.writeUInt16BE(height, 11);
  sof.writeUInt16BE(width, 13);
  sof.writeUInt8(components, 15);
  sof.writeUInt16BE(0xffd9, 16); // EOI
  return sof.subarray(0, 18);
}

describe("readJpeg", () => {
  it("reads dimensions and component count out of a frame header", () => {
    assert.deepEqual(readJpeg(tinyJpeg(640, 480, 3)), { width: 640, height: 480, components: 3 });
    assert.deepEqual(readJpeg(tinyJpeg(16, 9, 1)), { width: 16, height: 9, components: 1 });
  });

  it("refuses anything that is not a JPEG", () => {
    assert.equal(readJpeg(Buffer.from("not an image at all")), null);
    assert.equal(readJpeg(Buffer.from([0x89, 0x50, 0x4e, 0x47])), null); // PNG magic
    assert.equal(readJpeg(Buffer.alloc(0)), null);
  });
});

describe("textWidth", () => {
  it("measures mono as monospaced and Helvetica as proportional", () => {
    assert.equal(textWidth("MMMM", "F3", 10), textWidth("iiii", "F3", 10));
    assert.ok(textWidth("MMMM", "F1", 10) > textWidth("iiii", "F1", 10));
  });
});

describe("renderPdf", () => {
  it("produces a structurally valid single-page PDF", () => {
    const pdf = renderPdf({
      title: "The File — 114 Maple Street, Unit 2B",
      subtitle: "M. Alvarez · SEP 2026 – AUG 2027",
      footer: "TenantFile",
      blocks: [
        { type: "label", text: "Ledger" },
        { type: "row", left: "Rent · AUG 2026", right: "$1,850.00" },
        { type: "row", left: "Payment · Zelle", right: "-$1,850.00", muted: true },
        { type: "rule" },
        { type: "body", text: "Balance carried to September: nil." },
      ],
    });

    const head = pdf.subarray(0, 8).toString("latin1");
    assert.equal(head, "%PDF-1.4");
    const text = pdf.toString("latin1");
    assert.match(text, /\/Type \/Catalog/);
    assert.match(text, /\/Type \/Pages \/Count 1/);
    assert.match(text, /startxref/);
    assert.ok(text.endsWith("%%EOF\n"));
    // The em dash survived as a WinAnsi byte, not as a UTF-8 pair.
    assert.ok(text.includes("The File \x97 114 Maple Street"));
  });

  it("paginates long documents and numbers every page", () => {
    const blocks = Array.from({ length: 120 }, (_, i) => ({
      type: "row" as const,
      left: `Rent · line ${i + 1}`,
      right: "$1,850.00",
    }));
    const pdf = renderPdf({ title: "Long ledger", blocks, footer: "TenantFile" });
    const text = pdf.toString("latin1");
    const count = Number(/\/Type \/Pages \/Count (\d+)/.exec(text)![1]);
    assert.ok(count >= 3, `expected several pages, got ${count}`);
    assert.ok(text.includes("(1 of " + count + ")"));
    assert.ok(text.includes(`(${count} of ${count})`));
  });

  it("honours an explicit page break", () => {
    const pdf = renderPdf({
      title: "Two parts",
      blocks: [{ type: "body", text: "Part one." }, { type: "pagebreak" }, { type: "body", text: "Part two." }],
    });
    assert.match(pdf.toString("latin1"), /\/Type \/Pages \/Count 2/);
  });

  it("embeds a JPEG as a DCTDecode image XObject", () => {
    const pdf = renderPdf({
      title: "Maintenance photo",
      blocks: [{ type: "image", jpeg: tinyJpeg(200, 100), caption: "Kitchen sink, 14 Sep" }],
    });
    const text = pdf.toString("latin1");
    assert.match(text, /\/Subtype \/Image/);
    assert.match(text, /\/Filter \/DCTDecode/);
    assert.match(text, /\/Width 200 \/Height 100/);
    assert.match(text, /\/XObject << \/Im1 \d+ 0 R >>/);
  });

  it("says so in the document when a photo cannot be embedded", () => {
    const pdf = renderPdf({
      title: "Maintenance photo",
      blocks: [{ type: "image", jpeg: Buffer.from("this is a text file, not a photo") }],
    });
    const text = pdf.toString("latin1");
    assert.doesNotMatch(text, /\/Subtype \/Image/);
    assert.match(text, /not embeddable in this export/);
  });

  it("escapes parentheses and backslashes so the content stream stays valid", () => {
    const pdf = renderPdf({
      title: "Unit 2B (rear)",
      blocks: [{ type: "body", text: "Path C:\\leases (signed) — kept." }],
    });
    const text = pdf.toString("latin1");
    assert.ok(text.includes("Unit 2B \\(rear\\)"));
    assert.ok(text.includes("C:\\\\leases \\(signed\\)"));
  });

  it("computes xref offsets that point at real object headers", () => {
    const pdf = renderPdf({ title: "Offsets", blocks: [{ type: "body", text: "One line." }] });
    const text = pdf.toString("latin1");
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    assert.equal(text.slice(startxref, startxref + 4), "xref");
    const rows = /xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(text)!;
    const size = Number(rows[1]);
    const entries = rows[2].trim().split("\n");
    assert.equal(entries.length, size);
    // Object 1's offset must land on "1 0 obj".
    const firstOffset = Number(entries[1].slice(0, 10));
    assert.equal(text.slice(firstOffset, firstOffset + 7), "1 0 obj");
  });
});
