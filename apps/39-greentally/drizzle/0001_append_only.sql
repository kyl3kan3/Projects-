-- Append-only enforcement for the audit trail, in the database and not only in code.
--
-- The audit screen tells the reader: "Append-only — nothing in the product edits or
-- deletes a line of it." That sentence is what a procurement analyst is being asked
-- to trust, and it was true of the application while being unenforced underneath:
-- a plain DELETE removed the whole trail. No code path updates or deletes a row
-- here, but a convention holds only until someone adds a helper, and the whole
-- point of this table is that a figure can be traced back years later.
--
-- With the trigger the guarantee is structural: an UPDATE or DELETE raises, so the
-- mistake surfaces as a loud error in a test run instead of a quietly shortened
-- audit trail. Retention deliberately does not reach this table — bills and
-- extractions age out, the record that they happened does not.
--
-- Hand-written migration; drizzle-kit leaves it alone (its snapshot is a copy of
-- 0000's, so a later `generate` does not try to re-create the tables).

CREATE OR REPLACE FUNCTION greentally_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION greentally_append_only();
