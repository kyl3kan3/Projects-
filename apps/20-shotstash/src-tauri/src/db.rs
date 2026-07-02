//! SQLite layer: schema migrations, FTS5 index, queries.
//!
//! TODO:
//! - [ ] shots / shot_text(FTS5) / tags / collections / settings / license tables
//! - [ ] search query: FTS match + recency ranking, bbox payload for highlights
//! - [ ] bulk-import transaction batching; WAL mode
