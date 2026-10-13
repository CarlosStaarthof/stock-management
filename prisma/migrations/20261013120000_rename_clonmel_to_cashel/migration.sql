-- R6 (owner ruling, 2026-10-13): the second depot is Cashel, never Clonmel.
--
-- This is a DATA migration only: it renames the one Location row seeded by
-- 20260909135148_create_stock_domain. No table, column, index or type is added,
-- dropped or altered, so TRUNCATED_TABLES is unchanged and the schema is untouched.
--
-- The id changes too. ItemLocation.locationId and StockCount.locationId carry
-- ON UPDATE CASCADE (see 20260909135148), so existing child rows follow the rename
-- automatically. The WHERE matches on the old code only, so re-running against a
-- database that has already been renamed is a no-op.

UPDATE "Location"
SET "id" = 'loc_cashel',
    "code" = 'CASHEL',
    "name" = 'Cashel'
WHERE "code" = 'CLONMEL';
