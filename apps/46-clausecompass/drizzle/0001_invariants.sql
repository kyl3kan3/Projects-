-- Invariants that belong in the database, not only in application code.
--
-- 1. A clause with no source spans must be impossible to store. The product's whole
--    claim is that nothing in a report exists without a quote from the contract; if
--    that can only be enforced in TypeScript, one careless insert breaks the claim
--    silently and forever.
ALTER TABLE "clauses"
  ADD CONSTRAINT "clauses_source_spans_not_empty"
  CHECK (jsonb_array_length("source_spans") > 0);
--> statement-breakpoint
-- 2. One flag per (contract, rule, clause). A re-run of the scorer — after a retry,
--    or after a playbook edit — must not be able to double-flag the same clause with
--    the same rung of a threshold ladder. COALESCE covers missing-clause flags, whose
--    clause_id is NULL and which Postgres would otherwise treat as always distinct.
CREATE UNIQUE INDEX "flags_contract_rule_clause_key"
  ON "flags" ("contract_id", "rule_key", COALESCE("clause_id", '00000000-0000-0000-0000-000000000000'::uuid));
--> statement-breakpoint
-- 3. Credits used can never exceed credits granted, and never go negative. The ledger
--    is the only source of truth for "can this account run a review", so an off-by-one
--    in a refund path must fail loudly rather than mint a free review.
ALTER TABLE "purchases"
  ADD CONSTRAINT "purchases_credits_used_in_range"
  CHECK ("credits_used" >= 0 AND "credits_used" <= "credits");
