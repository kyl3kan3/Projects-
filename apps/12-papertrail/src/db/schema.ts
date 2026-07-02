/**
 * Drizzle schema for PaperTrail (see ARCHITECTURE.md data model):
 * users, brands, clients, documents, doc_blocks, signatures, invoices,
 * payments, reminder_rules, reminder_sends, events.
 * TODO: define tables; enforce chain via parent_document_id; immutable
 * signatures (no update path); pricing snapshots stored as jsonb copies.
 */
export {};
