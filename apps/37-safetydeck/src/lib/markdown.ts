/**
 * A deliberately tiny Markdown subset — the four things a toolbox talk needs:
 * `## heading`, `- bullet`, `1. numbered`, and paragraphs, with `**bold**` inline.
 *
 * Why not a Markdown library: talk bodies include custom talks pasted in by
 * customers, so this text is untrusted. A parser that emits HTML would need
 * sanitising; this one emits a typed block list that React renders as elements,
 * so there is no `dangerouslySetInnerHTML` anywhere in the app and no injection
 * surface at all.
 *
 * Pure module — used by the dashboard, the crew flow (client), and the PDF
 * renderers, which all have to agree on what a talk body means.
 */

export type InlineSpan = { text: string; bold: boolean };

export type Block =
  | { kind: "heading"; spans: InlineSpan[] }
  | { kind: "paragraph"; spans: InlineSpan[] }
  | { kind: "bullets"; items: InlineSpan[][] }
  | { kind: "numbers"; items: InlineSpan[][] };

/** Split `**bold**` runs out of a line. Unmatched `**` is treated as text. */
export function parseInline(line: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let rest = line;
  while (rest.length > 0) {
    const open = rest.indexOf("**");
    if (open === -1) {
      spans.push({ text: rest, bold: false });
      break;
    }
    const close = rest.indexOf("**", open + 2);
    if (close === -1) {
      spans.push({ text: rest, bold: false });
      break;
    }
    if (open > 0) spans.push({ text: rest.slice(0, open), bold: false });
    spans.push({ text: rest.slice(open + 2, close), bold: true });
    rest = rest.slice(close + 2);
  }
  return spans.filter((s) => s.text.length > 0);
}

export function parseTalkBody(body: string): Block[] {
  const blocks: Block[] = [];
  const lines = body.replace(/\r\n/g, "\n").split("\n");

  let paragraph: string[] = [];
  let bullets: string[] = [];
  let numbers: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length) {
      blocks.push({ kind: "bullets", items: bullets.map(parseInline) });
      bullets = [];
    }
  };
  const flushNumbers = () => {
    if (numbers.length) {
      blocks.push({ kind: "numbers", items: numbers.map(parseInline) });
      numbers = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushBullets();
    flushNumbers();
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushAll();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      blocks.push({ kind: "heading", spans: parseInline(heading[1]) });
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      flushNumbers();
      bullets.push(bullet[1]);
      continue;
    }
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      flushParagraph();
      flushBullets();
      numbers.push(numbered[1]);
      continue;
    }
    flushBullets();
    flushNumbers();
    paragraph.push(line);
  }
  flushAll();
  return blocks;
}

/** Plain text, for PDF rendering and read-time estimates. */
export function talkPlainText(body: string): string {
  return parseTalkBody(body)
    .map((b) => {
      if (b.kind === "heading" || b.kind === "paragraph") return spansToText(b.spans);
      return b.items.map((i) => `- ${spansToText(i)}`).join("\n");
    })
    .join("\n\n");
}

export function spansToText(spans: InlineSpan[]): string {
  return spans.map((s) => s.text).join("");
}

/** Read-aloud minutes at ~130 words per minute, floored at 3. */
export function readAloudMinutes(body: string): number {
  const words = talkPlainText(body).split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.round(words / 130));
}
