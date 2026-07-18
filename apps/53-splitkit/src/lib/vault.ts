// Vault module — on-device document storage. Copies captured/imported files
// into the sandboxed vault directory (expo-file-system), computes SHA-256 at
// capture BEFORE the metadata row is written, generates thumbnails, and
// serves file paths to the UI. Nothing here ever touches the network.
//
// TODO:
// - [ ] vaultDir bootstrap (documentDirectory/vault) with exclude-from-backup flag where supported
// - [ ] importFile(uri, meta): copy → hash (expo-crypto, chunked for multi-MB files) → documentRepo insert
// - [ ] hashPerformance guard from the Week-1 spike (background the hash with UI state if needed)
// - [ ] thumbnail generation/caching for image documents
// - [ ] deleteDocument: remove file + row (documents are deletable; sealed LOG ENTRIES are not — an entry referencing a deleted exhibit keeps the exhibit's recorded sha256)
// - [ ] size accounting for Settings storage display
export {};
