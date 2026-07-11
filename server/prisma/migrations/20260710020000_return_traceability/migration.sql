ALTER TABLE "ReturnItem" ADD COLUMN "orderItemId" TEXT;
ALTER TABLE "ReturnItem" ADD COLUMN "productId" TEXT;

-- Backfill only unambiguous legacy rows.
UPDATE "ReturnItem" ri
SET "orderItemId" = matched."orderItemId",
    "productId" = matched."productId"
FROM (
  SELECT
    ri2."id" AS "returnItemId",
    MIN(oi."id") AS "orderItemId",
    MIN(oi."productId") AS "productId"
  FROM "ReturnItem" ri2
  JOIN "ReturnOrder" ro ON ro."id" = ri2."returnOrderId"
  JOIN "OrderItem" oi ON oi."orderId" = ro."orderId" AND oi."name" = ri2."orderItemName"
  GROUP BY ri2."id"
  HAVING COUNT(oi."id") = 1
) matched
WHERE ri."id" = matched."returnItemId";

CREATE INDEX "ReturnItem_orderItemId_idx" ON "ReturnItem"("orderItemId");
CREATE INDEX "ReturnItem_productId_idx" ON "ReturnItem"("productId");
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
