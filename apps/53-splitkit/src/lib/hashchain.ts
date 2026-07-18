// Hash-chain module — the integrity core. Canonical serialization and SHA-256
// (expo-crypto) for log entries, chain verification, and the export digest.
// The claim is exact and must stay exact: the chain proves entries were not
// altered AFTER sealing; it does not prove the truth or timing of the
// underlying events. Both sentences appear in the export footer.
//
// Canonical entry string (ARCHITECTURE.md):
//   seq | prev_hash | occurred_at | entered_at | channel | participants | summary | detail | document_sha256?
//   ('|' separator, fixed field order, UTF-8; genesis prev_hash = "splitkit-genesis-v1")
//
// TODO:
// - [ ] canonicalString(entry, prevHash): string — exact field order, null → empty string
// - [ ] computeEntryHash(entry, prevHash): Promise<string> (SHA-256 hex via expo-crypto)
// - [ ] verifyChain(entries): { ok: true } | { ok: false, firstBreakSeq } — recomputes every hash in sequence
// - [ ] chainHead(): the max-seq entry's hash (repositories supplies rows)
// - [ ] exportDigest(entries): digest over all entry hashes for the PDF footer
// - [ ] Unit tests: seal 50, verify; mutate one field, expect break at that seq (Week-1 spike)
export {};
