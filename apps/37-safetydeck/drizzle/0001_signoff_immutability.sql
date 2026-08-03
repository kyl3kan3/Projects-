-- Sign-offs are legal artifacts: once a signature has synced, nothing may change
-- it. The API layer already refuses to update or delete one, but "the API layer
-- refuses" is a promise about code, and this data ends up in litigation. So the
-- database refuses too — defence in depth, and the reason a customer can say
-- their attendance records cannot be edited after the fact.
--
-- Voiding a signature appends a row to sign_off_corrections instead.

CREATE OR REPLACE FUNCTION sign_offs_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'sign_offs is append-only: a synced signature cannot be % (append a sign_off_corrections row instead)',
    lower(TG_OP)
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER sign_offs_no_update
  BEFORE UPDATE ON sign_offs
  FOR EACH ROW EXECUTE FUNCTION sign_offs_are_immutable();
--> statement-breakpoint

CREATE TRIGGER sign_offs_no_delete
  BEFORE DELETE ON sign_offs
  FOR EACH ROW EXECUTE FUNCTION sign_offs_are_immutable();
