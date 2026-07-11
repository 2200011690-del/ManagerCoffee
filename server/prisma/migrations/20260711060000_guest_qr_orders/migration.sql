ALTER TABLE "Table" ADD COLUMN "orderToken" TEXT;
ALTER TABLE "Order" ADD COLUMN "note" TEXT;

UPDATE "Table"
SET "orderToken" = 'tbl_' || md5("id" || clock_timestamp()::text || random()::text);

ALTER TABLE "Table" ALTER COLUMN "orderToken" SET NOT NULL;
CREATE UNIQUE INDEX "Table_orderToken_key" ON "Table"("orderToken");

CREATE TABLE "GuestOrder" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "clientRequestId" TEXT,
  "orderId" TEXT,
  "guestName" TEXT,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewedById" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuestOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestOrder_status_check" CHECK ("status" IN ('pending', 'accepted', 'rejected', 'cancelled'))
);

CREATE TABLE "GuestOrderItem" (
  "id" TEXT NOT NULL,
  "guestOrderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "qty" INTEGER NOT NULL,
  "note" TEXT,
  CONSTRAINT "GuestOrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestOrderItem_price_whole_vnd" CHECK ("price" >= 0 AND "price" = trunc("price")),
  CONSTRAINT "GuestOrderItem_qty_positive" CHECK ("qty" > 0)
);

CREATE UNIQUE INDEX "GuestOrder_orderId_key" ON "GuestOrder"("orderId");
CREATE UNIQUE INDEX "GuestOrder_tableId_clientRequestId_key" ON "GuestOrder"("tableId", "clientRequestId");
CREATE INDEX "GuestOrder_storeId_status_createdAt_idx" ON "GuestOrder"("storeId", "status", "createdAt");
CREATE INDEX "GuestOrder_tableId_createdAt_idx" ON "GuestOrder"("tableId", "createdAt");
CREATE INDEX "GuestOrderItem_guestOrderId_idx" ON "GuestOrderItem"("guestOrderId");
CREATE INDEX "GuestOrderItem_productId_idx" ON "GuestOrderItem"("productId");

ALTER TABLE "GuestOrder" ADD CONSTRAINT "GuestOrder_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestOrder" ADD CONSTRAINT "GuestOrder_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestOrder" ADD CONSTRAINT "GuestOrder_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestOrder" ADD CONSTRAINT "GuestOrder_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestOrderItem" ADD CONSTRAINT "GuestOrderItem_guestOrderId_fkey"
  FOREIGN KEY ("guestOrderId") REFERENCES "GuestOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestOrderItem" ADD CONSTRAINT "GuestOrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
