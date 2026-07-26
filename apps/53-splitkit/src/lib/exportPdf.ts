// Court-ready export builder — assembles the chronological log as HTML and
// renders it to PDF on device (expo-print), shared via expo-sharing. Always
// typeset as the light paper document (DESIGN.md): bone #F7F4EC, ink #1F1D18,
// oxblood #6E2B33 rules, Source Serif 4 headings, JBM hash lines. This
// artifact IS the brand. The word "admissible" must not appear anywhere.
//
// TODO:
// - [ ] Run hashchain.verifyChain() first; refuse to build on a break (caller shows explanation)
// - [ ] Cover block: date range, entry count, chain-head hash, generated-at
// - [ ] Per-entry block: occurred/entered timestamps, channel, participants, summary/detail, exhibit sha256 if attached, entry_hash line in mono
// - [ ] Method footer in plain language: what the hash chain proves and what it does not
// - [ ] expo-print → PDF → expo-sharing share sheet; progress + failure states for large logs
// - [ ] Snapshot test of the HTML for a seeded 20-entry log
export {};
