-- Append-only enforcement, in the database rather than in application code.
--
-- ROADMAP.md's acceptance criterion is "the audit table rejects UPDATE and DELETE
-- at the database-permission level". Grants alone are not enough: the owner of a
-- table, and any superuser, bypass them, and a development role is usually both.
-- So each table gets a trigger that raises, *and* the grants are revoked. The
-- trigger is what makes the guarantee true for every role; the REVOKE is what
-- keeps it true for a non-owner application role if a trigger were ever dropped.
--
-- `form_versions` is covered for the same reason `audit_events` is: a published
-- version is the text a patient's signature attests to. If it could be edited,
-- every past signature would silently start agreeing to something new.
--
-- Escape hatch, deliberately awkward: the triggers are named, so a genuine
-- correction (a legal hold, a court-ordered erasure) requires an operator to
-- ALTER TABLE ... DISABLE TRIGGER inside a transaction and re-enable it, which is
-- visible in the Postgres log. There is no application code path to it.

CREATE OR REPLACE FUNCTION formforge_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only: % is not permitted on this table', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION formforge_append_only();
--> statement-breakpoint

CREATE TRIGGER audit_events_no_delete
  BEFORE DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION formforge_append_only();
--> statement-breakpoint

CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION formforge_append_only();
--> statement-breakpoint

CREATE TRIGGER form_versions_no_update
  BEFORE UPDATE ON form_versions
  FOR EACH ROW EXECUTE FUNCTION formforge_append_only();
--> statement-breakpoint

CREATE TRIGGER form_versions_no_delete
  BEFORE DELETE ON form_versions
  FOR EACH ROW EXECUTE FUNCTION formforge_append_only();
--> statement-breakpoint

CREATE TRIGGER form_versions_no_truncate
  BEFORE TRUNCATE ON form_versions
  FOR EACH STATEMENT EXECUTE FUNCTION formforge_append_only();
--> statement-breakpoint

-- A signature record is written once and never touched again either.
CREATE TRIGGER signature_records_no_update
  BEFORE UPDATE ON signature_records
  FOR EACH ROW EXECUTE FUNCTION formforge_append_only();
--> statement-breakpoint

REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC;
--> statement-breakpoint

REVOKE UPDATE, DELETE, TRUNCATE ON form_versions FROM PUBLIC;
--> statement-breakpoint

REVOKE UPDATE ON signature_records FROM PUBLIC;
--> statement-breakpoint

-- Intakes reference form_versions with ON DELETE RESTRICT, so the retention sweep
-- never cascades into a protected table. Deleting a *practice* would have, via the
-- practice_id cascade, so that becomes RESTRICT too: removing a practice is now a
-- deliberate, ordered operation instead of a silent shredding of its evidence.
ALTER TABLE form_versions DROP CONSTRAINT IF EXISTS form_versions_practice_id_practices_id_fk;
--> statement-breakpoint

ALTER TABLE form_versions
  ADD CONSTRAINT form_versions_practice_id_practices_id_fk
  FOREIGN KEY (practice_id) REFERENCES practices(id) ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE form_versions DROP CONSTRAINT IF EXISTS form_versions_form_id_forms_id_fk;
--> statement-breakpoint

ALTER TABLE form_versions
  ADD CONSTRAINT form_versions_form_id_forms_id_fk
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE RESTRICT;
