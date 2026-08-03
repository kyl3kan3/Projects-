/**
 * A deliberately tiny Markdown renderer for changelog bodies.
 *
 * It handles exactly what `draftEntry` emits and what a human is likely to add:
 * `##`/`###` headings, `-` bullets, paragraphs, `**bold**`, `_italic_`,
 * `` `code` `` and `[text](url)`. Everything else is rendered as literal text.
 *
 * No `dangerouslySetInnerHTML` anywhere: the body is customer-authored and shown
 * on a public page, so it is turned into React elements rather than HTML. That
 * makes an injected `<script>` impossible by construction rather than by
 * sanitiser diligence, and it is why a full Markdown dependency was not worth
 * the attack surface for six syntaxes.
 */

import type { ReactNode } from "react";

const INLINE = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(INLINE).filter((part) => part !== "");
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith("_") && part.endsWith("_")) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const href = link[2];
      // Only http(s) and relative links: a `javascript:` href in a public page
      // authored by a customer is a stored XSS.
      const safe = /^https?:\/\//i.test(href) || href.startsWith("/") || href.startsWith("#");
      return safe ? (
        <a key={key} href={href} rel="noopener nofollow">
          {link[1]}
        </a>
      ) : (
        <span key={key}>{link[1]}</span>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const key = `p-${blocks.length}`;
    blocks.push(<p key={key}>{renderInline(paragraph.join(" "), key)}</p>);
    paragraph = [];
  };
  const flushBullets = () => {
    if (bullets.length === 0) return;
    const key = `ul-${blocks.length}`;
    blocks.push(
      <ul key={key}>
        {bullets.map((item, i) => (
          <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushParagraph();
      flushBullets();
      continue;
    }
    if (line.startsWith("### ")) {
      flushParagraph();
      flushBullets();
      blocks.push(
        <h3 key={`h3-${blocks.length}`}>{renderInline(line.slice(4), `h3-${blocks.length}`)}</h3>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      flushBullets();
      blocks.push(
        <h2 key={`h2-${blocks.length}`}>{renderInline(line.slice(3), `h2-${blocks.length}`)}</h2>,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph();
      bullets.push(line.replace(/^\s*[-*]\s+/, ""));
      continue;
    }
    // A continuation line indented under a bullet belongs to that bullet — this
    // is how the drafted migration note stays attached to its finding.
    if (bullets.length > 0 && /^\s{2,}\S/.test(raw)) {
      bullets[bullets.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushBullets();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushBullets();

  return <>{blocks}</>;
}
