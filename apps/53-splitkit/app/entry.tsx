// New log entry modal — the form + the SEAL. Fields: occurred-at (date/time),
// channel, participants, summary (required), detail, optional attached vault
// document. Writes NOTHING until "Seal into the record": one transaction
// assigns seq, sets entered_at, computes the chain hash, inserts — then plays
// the record-seal signature animation (DESIGN.md). Sealed entries are immutable.
//
// TODO:
// - [ ] Ruled form per DESIGN.md; Seal button disabled until summary + occurred-at set
// - [ ] Seal action calls repositories.sealLogEntry() (src/lib/hashchain.ts does the hashing)
// - [ ] Record-seal animation: oxblood rule draws → hash line types on → RECORDED stamp + haptic (~700ms; reduced-motion = 200ms fade)
// - [ ] Document attach picker (from vault) storing document_id
// - [ ] Free-tier gate: 11th entry routes to paywall before sealing
// - [ ] Draft preservation if backgrounded mid-entry (form state, never a sealed row)
export {};
