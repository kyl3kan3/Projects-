// Document capture flow — camera or library import into the on-device vault.
// File is copied into the sandbox vault directory, SHA-256 hashed via
// expo-crypto BEFORE the metadata row is written, then the fast seal (350ms)
// confirms the hash. Optional link to an inventory asset.
//
// TODO:
// - [ ] expo-image-picker camera + library paths with permission handling (copy per app.json strings)
// - [ ] Copy into vault dir + hash via src/lib/vault.ts; show hash-resolving state
// - [ ] Metadata form: title, kind (statement/deed/tax_return/prenup/…), asset link, source note
// - [ ] Fast seal animation on hash resolution
// - [ ] Free-tier gate: 6th document routes to paywall
// - [ ] Error states: capture cancelled, file too large, hash failure (retry)
export {};
