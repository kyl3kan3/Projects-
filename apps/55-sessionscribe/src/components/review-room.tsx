/**
 * src/components/review-room.tsx
 *
 * The review room: note sheet + transcript with bidirectional source-span
 * tracing. The most important screen in the product — clinicians live here.
 *
 * TODO:
 * - [ ] Phone (390px): Note/Transcript top tab, span tracing preserved
 *       across the flip; >=768px: two panes, spans tracing across the gutter.
 * - [ ] Note sheet per DESIGN.md: card radius 12, section Labels, Body
 *       16/1.6, hairline dividers between sections (never nested cards).
 * - [ ] Span tracing: tap a drafted sentence -> 1.5px sage underline +
 *       12% sage wash on its transcript segments; reverse direction too;
 *       one pair active at a time.
 * - [ ] Inline editing with versioned autosave (reason: edit).
 * - [ ] Per-section "Regenerate" (amber progress hairline, old->new
 *       crossfade 200ms — never typewriter output).
 * - [ ] Untraceable sentences flagged visibly (sourceSpans empty).
 * - [ ] Sticky bottom bar: Sign note primary + word count.
 * - [ ] Purged-media state: "source audio purged per your retention policy".
 */

export type ReviewRoomProps = {
  noteId: string;
};

export function ReviewRoom(_props: ReviewRoomProps) {
  // TODO: implement per DESIGN.md "Mobile layout — Review room"
  return null;
}
