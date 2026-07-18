// Log — the communication & incident record. Reverse-chronological sealed
// entry cards, each with its oxblood seal line (ENTERED timestamp · #seq ·
// hash). Header: chain-verified badge + Export (paid) quiet action. Sticky
// "New entry" primary button in the bottom third.
//
// TODO:
// - [ ] Entry list from repositories (paged); entry cards per DESIGN.md, no edit affordance on sealed entries
// - [ ] Chain status badge (verdigris shield "Chain verified · n entries"); tap → verification detail
// - [ ] New entry → /entry modal; Export → /export (paywall-gated)
// - [ ] Correction pattern surfaced in UI copy ("To amend, seal a correction entry")
// - [ ] Attached-exhibit indicator when an entry links a vault document
// - [ ] Empty state teaching sealing + immutability (registrar voice, per DESIGN.md)
export {};
