/**
 * Ingestion CLI: CSV/JSON -> validate (config attributeSchema) -> dedupe
 * (name+domain fuzzy) -> enrich (geocode, logo) -> SQLite.
 * TODO: implement with per-row error report; idempotent re-runs.
 */
export {};
