-- Append-only enforcement, in the database rather than only in the code.
--
-- Three tables are this product's evidence: the audit trail, the version
-- snapshots, and the signatures over them. Application code never updates or
-- deletes a row in any of them — but "never" written as a convention survives
-- exactly until someone adds a helper. These triggers make it structural: an
-- UPDATE or DELETE raises, so the mistake is a loud error in a test run rather
-- than a quietly rewritten clinical record.
--
-- Hand-written migration; drizzle-kit leaves it alone (its snapshot is a copy of
-- 0000's, so a later `generate` does not try to re-create the tables).

CREATE OR REPLACE FUNCTION sessionscribe_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION sessionscribe_append_only();

CREATE TRIGGER note_versions_append_only
  BEFORE UPDATE OR DELETE ON note_versions
  FOR EACH ROW EXECUTE FUNCTION sessionscribe_append_only();

CREATE TRIGGER signatures_append_only
  BEFORE UPDATE OR DELETE ON signatures
  FOR EACH ROW EXECUTE FUNCTION sessionscribe_append_only();
