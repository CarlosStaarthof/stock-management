-- Feature #21 pin_auth: username and PIN replace email and password (spec 021 AC-2).
--
-- Every existing row survives: StockCount references User with RESTRICT, and a person who
-- counted is part of the record. This migration inserts no row into any table. A row
-- migrated from #3 becomes ACTIVE or DEACTIVATED with no username and no PIN, so nobody can
-- sign in until the operator gives an ADMIN row both with `npm run pin:reset`.

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "AuthEventKind" AS ENUM ('PIN_FAILURE', 'PROFILE_REQUEST', 'SETUP_FAILURE', 'BUDGET_RESET');

-- `status` replaces `active`, and is backfilled from it BEFORE `active` is dropped: true
-- becomes ACTIVE, false becomes DEACTIVATED. The column default (PENDING) is for rows a
-- request creates later; no existing row keeps it.
ALTER TABLE "User" ADD COLUMN "status" "ProfileStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "User"
SET "status" = CASE WHEN "active" THEN 'ACTIVE'::"ProfileStatus" ELSE 'DEACTIVATED'::"ProfileStatus" END;

-- The credential columns start NULL on every existing row; the epoch starts at 0.
ALTER TABLE "User" ADD COLUMN "username" TEXT,
ADD COLUMN "requestedUsername" TEXT,
ADD COLUMN "pinHash" TEXT,
ADD COLUMN "pinKeyId" TEXT,
ADD COLUMN "sessionEpoch" INTEGER NOT NULL DEFAULT 0;

-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "email",
DROP COLUMN "passwordHash",
DROP COLUMN "active";

-- CreateTable
CREATE TABLE "AccountLock" (
    "accountKey" TEXT NOT NULL,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountLock_pkey" PRIMARY KEY ("accountKey")
);

-- CreateTable
CREATE TABLE "AuthEvent" (
    "id" TEXT NOT NULL,
    "kind" "AuthEventKind" NOT NULL,
    "bucket" TEXT NOT NULL,
    "accountKey" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupClaim" (
    "id" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetupClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "AuthEvent_bucket_kind_at_idx" ON "AuthEvent"("bucket", "kind", "at");

-- CreateIndex
CREATE INDEX "AuthEvent_accountKey_at_idx" ON "AuthEvent"("accountKey", "at");

-- CreateIndex
CREATE UNIQUE INDEX "SetupClaim_userId_key" ON "SetupClaim"("userId");

-- AddForeignKey
ALTER TABLE "SetupClaim" ADD CONSTRAINT "SetupClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written, as #4's `Item_description_not_empty` is: Prisma's schema language cannot
-- express a CHECK constraint. These are the shapes 021 *Data touched* names. Because a
-- stored username can only be lower-case, the unique index above IS the case-insensitive
-- uniqueness rule (S1).
ALTER TABLE "User"
  ADD CONSTRAINT "User_username_format"
    CHECK ("username" IS NULL OR "username" ~ '^[a-z][a-z0-9._-]{2,31}$'),
  ADD CONSTRAINT "User_requested_username_format"
    CHECK ("requestedUsername" IS NULL OR "requestedUsername" ~ '^[a-z][a-z0-9._-]{2,31}$'),
  ADD CONSTRAINT "User_request_only_when_pending"
    CHECK (("requestedUsername" IS NOT NULL) = ("status" = 'PENDING')),
  ADD CONSTRAINT "User_pending_shape"
    CHECK ("status" <> 'PENDING' OR ("username" IS NULL AND "pinHash" IS NOT NULL AND "role" = 'YARD_STAFF')),
  ADD CONSTRAINT "User_pin_needs_username"
    CHECK ("pinHash" IS NULL OR "status" = 'PENDING' OR "username" IS NOT NULL),
  ADD CONSTRAINT "User_pin_only_when_live"
    CHECK ("pinHash" IS NULL OR "status" IN ('PENDING', 'ACTIVE')),
  ADD CONSTRAINT "User_pin_key_with_pin"
    CHECK (("pinHash" IS NULL) = ("pinKeyId" IS NULL));

ALTER TABLE "SetupClaim"
  ADD CONSTRAINT "SetupClaim_single_row" CHECK ("id" = 1);

ALTER TABLE "AccountLock"
  ADD CONSTRAINT "AccountLock_key_format" CHECK ("accountKey" ~ '^[0-9a-f]{64}$');

ALTER TABLE "AuthEvent"
  ADD CONSTRAINT "AuthEvent_account_key_format"
    CHECK ("accountKey" IS NULL OR "accountKey" ~ '^[0-9a-f]{64}$');
