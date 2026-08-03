/**
 * src/lib/pdf-text.ts
 *
 * A small, dependency-free text extractor for PDFs.
 *
 * Why it exists: the ACORD extraction path runs through Claude when a key is
 * present, but the certificate still has to be usable without one — the local
 * extractor (lib/acord.ts) reads the form's text and applies a deterministic
 * grammar. Both paths need the same thing first: the words on the page.
 *
 * Scope, stated honestly. This handles text-based PDFs: uncompressed and
 * Flate-compressed content streams, literal `(...)` and hex `<...>` strings, and
 * the `Tj / TJ / ' / "` show-text operators. It does **not** do OCR, CID font
 * mapping, or layout reconstruction. A scanned ACORD produces no text, and the
 * caller must treat "no text" as a parse failure rather than as an empty form —
 * that distinction is the difference between "we could not read this" and a
 * confident wrong answer.
 */

import { inflateSync, inflateRawSync } from "node:zlib";

/** Where a PDF's text came from — the caller needs to know it found anything. */
export interface PdfTextResult {
  text: string;
  /** Number of content streams decoded. Zero means nothing was readable. */
  streams: number;
  /** True when at least one stream failed to decompress. */
  partial: boolean;
}

function decodeStreamBody(dict: string, body: Buffer): Buffer | null {
  const filters = /\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/.exec(dict)?.[1] ?? "";
  if (/FlateDecode/.test(filters)) {
    try {
      return inflateSync(body);
    } catch {
      try {
        return inflateRawSync(body);
      } catch {
        return null;
      }
    }
  }
  // No filter, or a filter we do not implement (DCTDecode is an image — skip it).
  if (!filters || /^\s*$/.test(filters)) return body;
  if (/DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode/.test(filters)) return null;
  return body;
}

/** Pull every decodable stream body out of a PDF. */
function contentStreams(buf: Buffer): { bodies: Buffer[]; partial: boolean } {
  const latin1 = buf.toString("latin1");
  const bodies: Buffer[] = [];
  let partial = false;
  let cursor = 0;

  for (;;) {
    const start = latin1.indexOf("stream", cursor);
    if (start === -1) break;
    // "endstream" also contains "stream": skip those matches.
    if (latin1.startsWith("endstream", start - 3)) {
      cursor = start + 6;
      continue;
    }
    const end = latin1.indexOf("endstream", start);
    if (end === -1) break;

    // The stream dictionary is the `<< ... >>` immediately before the keyword.
    const dictEnd = latin1.lastIndexOf(">>", start);
    const dictStart = dictEnd === -1 ? -1 : latin1.lastIndexOf("<<", dictEnd);
    const dict = dictStart === -1 ? "" : latin1.slice(dictStart, dictEnd + 2);

    let bodyStart = start + "stream".length;
    if (latin1[bodyStart] === "\r") bodyStart += 1;
    if (latin1[bodyStart] === "\n") bodyStart += 1;

    let bodyEnd = end;
    // Trim the EOL that precedes `endstream`.
    if (latin1[bodyEnd - 1] === "\n") bodyEnd -= 1;
    if (latin1[bodyEnd - 1] === "\r") bodyEnd -= 1;

    const decoded = decodeStreamBody(dict, buf.subarray(bodyStart, bodyEnd));
    if (decoded) bodies.push(decoded);
    else partial = true;

    cursor = end + "endstream".length;
  }

  return { bodies, partial };
}

const ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  "(": "(",
  ")": ")",
  "\\": "\\",
};

/** Decode a PDF literal string body (the text between the outer parentheses). */
function decodeLiteral(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[++i];
    if (next === undefined) break;
    if (next >= "0" && next <= "7") {
      let oct = next;
      while (oct.length < 3 && raw[i + 1] >= "0" && raw[i + 1] <= "7") oct += raw[++i];
      out += String.fromCharCode(parseInt(oct, 8));
      continue;
    }
    if (next === "\n") continue; // line continuation
    if (next === "\r") {
      if (raw[i + 1] === "\n") i++;
      continue;
    }
    out += ESCAPES[next] ?? next;
  }
  return out;
}

function decodeHex(raw: string): string {
  const hex = raw.replace(/[^0-9a-fA-F]/g, "");
  let out = "";
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

/**
 * Walk one content stream, emitting shown text and a newline wherever the text
 * cursor is repositioned. That is enough structure for a labelled form: each
 * ACORD cell is drawn as its own positioned run.
 */
function textFromContent(content: string): string {
  let out = "";
  let pending = ""; // strings collected since the last operator
  let i = 0;
  const n = content.length;

  const flushLine = () => {
    if (out.length && !out.endsWith("\n")) out += "\n";
  };

  while (i < n) {
    const ch = content[i];

    if (ch === "(") {
      let depth = 1;
      let j = i + 1;
      let raw = "";
      while (j < n && depth > 0) {
        const c = content[j];
        if (c === "\\") {
          raw += c + (content[j + 1] ?? "");
          j += 2;
          continue;
        }
        if (c === "(") depth++;
        else if (c === ")") {
          depth--;
          if (depth === 0) break;
        }
        raw += c;
        j++;
      }
      pending += decodeLiteral(raw);
      i = j + 1;
      continue;
    }

    if (ch === "<" && content[i + 1] !== "<") {
      const close = content.indexOf(">", i);
      if (close === -1) break;
      pending += decodeHex(content.slice(i + 1, close));
      i = close + 1;
      continue;
    }

    // Operator token.
    if (/[A-Za-z'"*]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9'"*]/.test(content[j])) j++;
      const op = content.slice(i, j);
      i = j;

      if (op === "Tj" || op === "TJ" || op === "'" || op === '"') {
        if (op === "'" || op === '"') flushLine();
        out += pending;
        pending = "";
        continue;
      }
      if (op === "Td" || op === "TD" || op === "T*" || op === "BT" || op === "ET" || op === "Tm") {
        // Repositioning ends the current line. `pending` here belongs to no
        // show-text operator, so it is discarded rather than guessed at.
        pending = "";
        flushLine();
        continue;
      }
      pending = "";
      continue;
    }

    i++;
  }

  return out;
}

export function extractPdfText(bytes: Uint8Array): PdfTextResult {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const { bodies, partial } = contentStreams(buf);
  const parts: string[] = [];
  for (const body of bodies) {
    const content = body.toString("latin1");
    // Only page content streams carry show-text operators; skipping the rest keeps
    // font programs and metadata out of the result.
    if (!/(Tj|TJ)\b/.test(content)) continue;
    const text = textFromContent(content);
    if (text.trim()) parts.push(text);
  }
  return {
    text: parts.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    streams: parts.length,
    partial,
  };
}

/** Normalise extracted text for matching: collapse runs of whitespace per line. */
export function normaliseLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
