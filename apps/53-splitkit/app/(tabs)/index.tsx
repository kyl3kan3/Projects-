// Checklist (home) — the state-aware financial-discovery checklist. Display
// greeting ("The record is current."), state + stage label, progress strip,
// next undone task surfaced as a card, sectioned checklist rows (ledger lines).
// When stage = post_decree, the rebuild plan sections render here too.
//
// TODO:
// - [ ] Merge bundled tasks (src/data/checklists.ts) with checklist_status via repositories, filtered by state/stage
// - [ ] Progress strip: sections × done counts in JBM
// - [ ] Checklist rows per DESIGN.md (24px checkbox, verdigris done fill, no strikethrough)
// - [ ] "Next task" card above the fold in the thumb zone
// - [ ] Status writes (todo/in_progress/done/na) with 120ms tap feedback + haptic
// - [ ] "What this list is — and isn't" education link (non-advice framing)
// - [ ] Empty/loading states in registrar voice
export {};
