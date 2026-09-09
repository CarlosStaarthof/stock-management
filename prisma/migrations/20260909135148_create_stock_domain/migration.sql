-- CreateEnum
CREATE TYPE "CountStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "UnitKind" AS ENUM ('TONNE', 'KILOGRAM', 'LITRE', 'UNIT', 'LINEAR_METRE');

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ItemType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplierId" TEXT,
    "itemTypeId" TEXT NOT NULL,
    "unitLabel" TEXT,
    "unitKind" "UnitKind" NOT NULL DEFAULT 'UNIT',
    "unitQuantityKg" DECIMAL(12,4),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPrice" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "effectiveFrom" DATE NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemLocation" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ItemLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "countDate" DATE NOT NULL,
    "status" "CountStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "signedById" TEXT,
    "signedAt" TIMESTAMP(3),
    "signatureSvg" TEXT,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "stockCountId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,4),
    "unitPriceSnapshot" DECIMAL(18,8),
    "note" TEXT,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ItemType_code_key" ON "ItemType"("code");

-- CreateIndex
CREATE INDEX "Item_itemTypeId_idx" ON "Item"("itemTypeId");

-- CreateIndex
CREATE INDEX "Item_supplierId_idx" ON "Item"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_description_supplierId_key" ON "Item"("description", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemPrice_itemId_effectiveFrom_key" ON "ItemPrice"("itemId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ItemLocation_locationId_sortOrder_idx" ON "ItemLocation"("locationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ItemLocation_itemId_locationId_key" ON "ItemLocation"("itemId", "locationId");

-- CreateIndex
CREATE INDEX "StockCount_periodYear_periodMonth_idx" ON "StockCount"("periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "StockCount_createdById_idx" ON "StockCount"("createdById");

-- CreateIndex
CREATE INDEX "StockCount_approvedById_idx" ON "StockCount"("approvedById");

-- CreateIndex
CREATE INDEX "StockCount_signedById_idx" ON "StockCount"("signedById");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_locationId_periodYear_periodMonth_key" ON "StockCount"("locationId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "StockCountLine_itemId_idx" ON "StockCountLine"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_stockCountId_itemId_key" ON "StockCountLine"("stockCountId", "itemId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPrice" ADD CONSTRAINT "ItemPrice_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLocation" ADD CONSTRAINT "ItemLocation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLocation" ADD CONSTRAINT "ItemLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written below this line. `prisma migrate dev --create-only` generated
-- everything above; Prisma's schema language cannot express a CHECK constraint
-- or a data seed, so spec 004 adds them here. See specs/features/004-domain_schema.md,
-- "Constraints Prisma cannot express, written into the migration by hand".
-- ---------------------------------------------------------------------------

-- Invariant 9 taken literally: "required and non-empty". NOT NULL alone lets '' and
-- '   ' through, which is exactly the blank-description row the importer must fail
-- loudly on (specs/domain-model.md Part 2). It forbids emptiness, not untrimmed input:
-- trimming stays the importer's rule.
ALTER TABLE "Item"
  ADD CONSTRAINT "Item_description_not_empty" CHECK (btrim("description") <> '');

-- Not a new domain rule - it is what "month" means. Without it a mistyped period
-- silently becomes a count belonging to month 13 forever.
ALTER TABLE "StockCount"
  ADD CONSTRAINT "StockCount_periodMonth_range" CHECK ("periodMonth" BETWEEN 1 AND 12);

-- The two yards of specs/product-brief.md. Location belongs to no other feature, and a
-- table that must never be empty for Invariant 7 - "a period is complete only when every
-- active Location has an APPROVED count" - cannot belong to nobody. The ids are literal
-- so development, test and production agree on them; ON CONFLICT makes a re-run a no-op.
INSERT INTO "Location" ("id", "code", "name", "active", "sortOrder") VALUES
  ('loc_dublin',  'DUBLIN',  'Dublin',  true, 1),
  ('loc_clonmel', 'CLONMEL', 'Clonmel', true, 2)
ON CONFLICT ("code") DO NOTHING;
