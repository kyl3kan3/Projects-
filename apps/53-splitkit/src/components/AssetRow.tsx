// AssetRow + DocumentCard — inventory building blocks per DESIGN.md.
// AssetRow: 64px full-bleed row — kind glyph (ink-2), name Title,
// institution/last-4 in JBM Data, right-aligned signed value (debts −),
// titling Label chip. DocumentCard: card radius 12, 64×64 thumbnail,
// title/kind/date, and the hash line (seal glyph 14px oxblood + JBM digest).
//
// TODO:
// - [ ] AssetRow with signed currency formatting (cents → display, tabular JBM)
// - [ ] Titling chip variants (joint/hers/his/trust/unknown)
// - [ ] DocumentCard with thumbnail loading + fallback (file-text glyph), hash line truncated to 12 hex
// - [ ] Press → detail sheets wired by parent screens
export {};
