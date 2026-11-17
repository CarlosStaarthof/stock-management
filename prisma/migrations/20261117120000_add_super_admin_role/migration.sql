-- Feature #22 roles_home_menu: SUPER_ADMIN sits above ADMIN (spec 022 AC-1, D1).
--
-- Additive only: the two existing labels and every existing row keep their role. No
-- application path writes the new value; 20261117121000_promote_carlos_super_admin is the
-- one migration that promotes an existing row.
--
-- contract-step: release before 2026-11-17 never wrote or read SUPER_ADMIN; its Role union
-- held only YARD_STAFF and ADMIN, so adding a third label cannot break it.

ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
