/**
 * Cost ingestion: Cost Explorer batched queries (polling discipline —
 * CE API costs $0.01/request), CUR parquet/csv parsing from customer S3,
 * normalization into cost_facts + tag_sets, 3-month backfill.
 * TODO: implement two-speed model (CE fast path, CUR accuracy path).
 */
export {};
