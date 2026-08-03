/**
 * Highlight — underlines the profile's keyword hits inside the notice text
 * (DESIGN.md: "description with keyword hits underlined in `federal`").
 *
 * Built out of React nodes rather than an HTML string, so a notice that contains
 * `<script>` — and government notices contain all sorts of things — cannot become
 * markup. No `dangerouslySetInnerHTML` anywhere near portal data.
 */

import { Fragment } from "react";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function Highlight({ text, phrases }: { text: string; phrases: string[] }) {
  const terms = phrases.map((p) => p.trim()).filter(Boolean);
  if (terms.length === 0) return <>{text}</>;

  // Longest first, so "managed detection and response" wins over "managed".
  const pattern = new RegExp(
    `(${terms
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(escapeRegex)
      .join("|")})`,
    "gi",
  );

  const parts = text.split(pattern);
  const lower = new Set(terms.map((t) => t.toLowerCase()));

  return (
    <>
      {parts.map((part, index) =>
        lower.has(part.toLowerCase()) ? (
          <mark
            key={index}
            className="hit"
            style={{ background: "transparent", color: "inherit" }}
          >
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Notice text arrives as paragraphs separated by blank lines. Keep them. */
export function NoticeBody({ text, phrases }: { text: string; phrases: string[] }) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return (
      <p className="t-secondary">
        This source publishes no description for the notice — only its metadata and a link. Open the
        original to read the scope.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="t-body">
          <Highlight text={paragraph} phrases={phrases} />
        </p>
      ))}
    </div>
  );
}
