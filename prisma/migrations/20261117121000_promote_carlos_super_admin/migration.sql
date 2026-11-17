-- Feature #22 roles_home_menu: promote the existing carlos-staarthof profile (spec 022
-- AC-2, D2, ruling R2).
--
-- THIS MIGRATION NEVER CREATES A PROFILE. If the username is absent it changes no row and
-- succeeds. If it is present, only the role column changes: status, username, PIN columns
-- and epoch are byte-identical afterwards.
--
-- Idempotent: a second application matches the same row (already SUPER_ADMIN) and writes
-- the same value. It refuses, rolling the migration back, if the result would leave more
-- than one SUPER_ADMIN.

UPDATE "User"
SET "role" = 'SUPER_ADMIN'
WHERE "username" = 'carlos-staarthof';

DO $$
DECLARE
  super_admins INTEGER;
BEGIN
  SELECT count(*) INTO super_admins FROM "User" WHERE "role" = 'SUPER_ADMIN';
  IF super_admins > 1 THEN
    RAISE EXCEPTION 'Refusing to leave % SUPER_ADMIN profiles; at most one is allowed', super_admins;
  END IF;
END
$$;
