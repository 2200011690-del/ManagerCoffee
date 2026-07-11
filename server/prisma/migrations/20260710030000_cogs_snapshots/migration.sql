ALTER TABLE "OrderItem" ADD COLUMN "cogsAmount" DOUBLE PRECISION;
ALTER TABLE "OrderItem" ADD COLUMN "cogsComplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReturnItem" ADD COLUMN "cogsAmount" DOUBLE PRECISION;
ALTER TABLE "Inventory" ADD COLUMN "avgCost" DOUBLE PRECISION;

CREATE TABLE "OrderItemCostSnapshot" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "inventoryId" TEXT,
    "inventoryName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION,
    "totalCost" DOUBLE PRECISION,
    "complete" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "OrderItemCostSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderItemCostSnapshot_orderItemId_idx" ON "OrderItemCostSnapshot"("orderItemId");
CREATE INDEX "OrderItemCostSnapshot_inventoryId_idx" ON "OrderItemCostSnapshot"("inventoryId");
ALTER TABLE "OrderItemCostSnapshot" ADD CONSTRAINT "OrderItemCostSnapshot_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItemCostSnapshot" ADD CONSTRAINT "OrderItemCostSnapshot_inventoryId_fkey"
  FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Inventory" inventory
SET "avgCost" = costs."avgCost"
FROM (
  SELECT
    "inventoryId",
    round(SUM("qtyChange" * "cost") / NULLIF(SUM("qtyChange"), 0)) AS "avgCost"
  FROM "StockTransaction"
  WHERE "type" = 'IMPORT' AND "cost" IS NOT NULL AND "qtyChange" > 0
  GROUP BY "inventoryId"
) costs
WHERE inventory."id" = costs."inventoryId";

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_cogs_whole_vnd"
  CHECK ("cogsAmount" IS NULL OR ("cogsAmount" >= 0 AND "cogsAmount" = trunc("cogsAmount")));
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_cogs_whole_vnd"
  CHECK ("cogsAmount" IS NULL OR ("cogsAmount" >= 0 AND "cogsAmount" = trunc("cogsAmount")));
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_avgCost_whole_vnd"
  CHECK ("avgCost" IS NULL OR ("avgCost" >= 0 AND "avgCost" = trunc("avgCost")));
ALTER TABLE "OrderItemCostSnapshot" ADD CONSTRAINT "OrderItemCostSnapshot_cost_whole_vnd"
  CHECK (
    "quantity" >= 0 AND
    ("unitCost" IS NULL OR ("unitCost" >= 0 AND "unitCost" = trunc("unitCost"))) AND
    ("totalCost" IS NULL OR ("totalCost" >= 0 AND "totalCost" = trunc("totalCost")))
  );
