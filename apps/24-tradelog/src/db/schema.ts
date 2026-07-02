/**
 * Drizzle schema (see ARCHITECTURE.md): users, accounts, executions, trades,
 * trade_executions, setups, trade_notes, findings, import_batches.
 * TODO: define tables; dedupe_hash unique per account; indexes on
 * (account_id, executed_at) and (user_id, closed_at).
 */
export {};
