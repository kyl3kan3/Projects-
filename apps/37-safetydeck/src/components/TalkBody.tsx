import { parseTalkBody, type Block, type InlineSpan } from "@/lib/markdown";

/**
 * Renders a talk body from the Markdown subset in `lib/markdown.ts`.
 *
 * Deliberately element-by-element rather than HTML: custom talks are pasted in
 * by customers, so the text is untrusted, and there is no
 * `dangerouslySetInnerHTML` anywhere in this product.
 */

function spans(list: InlineSpan[]) {
  return list.map((span, i) =>
    span.bold ? <strong key={i}>{span.text}</strong> : <span key={i}>{span.text}</span>,
  );
}

function block(b: Block, i: number) {
  switch (b.kind) {
    case "heading":
      return <h3 key={i}>{spans(b.spans)}</h3>;
    case "paragraph":
      return <p key={i}>{spans(b.spans)}</p>;
    case "bullets":
      return (
        <ul key={i}>
          {b.items.map((item, j) => (
            <li key={j}>{spans(item)}</li>
          ))}
        </ul>
      );
    case "numbers":
      return (
        <ol key={i}>
          {b.items.map((item, j) => (
            <li key={j}>{spans(item)}</li>
          ))}
        </ol>
      );
  }
}

export function TalkBody({ body }: { body: string }) {
  return <div className="talk-body">{parseTalkBody(body).map(block)}</div>;
}
