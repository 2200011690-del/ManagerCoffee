-- Persist realtime carts so backend restarts do not lose active orders.
CREATE TABLE "ActiveCart" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cartKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ActiveCart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActiveCart_storeId_cartKey_key" ON "ActiveCart"("storeId", "cartKey");
CREATE INDEX "ActiveCart_storeId_updatedAt_idx" ON "ActiveCart"("storeId", "updatedAt");
ALTER TABLE "ActiveCart" ADD CONSTRAINT "ActiveCart_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep the exact refund allocated to each returned line.
ALTER TABLE "ReturnItem" ADD COLUMN "refundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
UPDATE "ReturnItem" SET "refundAmount" = round("price" * "qty");

-- Existing VND columns remain float-compatible for this release, but are normalized
-- and constrained to whole VND values so binary fractions cannot enter money flows.
UPDATE "User" SET "hourlyRate" = round("hourlyRate");
UPDATE "Product" SET "price" = round("price");
UPDATE "Order" SET
  "subtotal" = round("subtotal"),
  "vatAmount" = round("vatAmount"),
  "total" = round("total"),
  "discountAmount" = round(COALESCE("discountAmount", 0)),
  "orderDiscount" = round(COALESCE("orderDiscount", 0));
UPDATE "OrderItem" SET "price" = round("price"), "discount" = round(COALESCE("discount", 0));
UPDATE "StockTransaction" SET "cost" = round("cost") WHERE "cost" IS NOT NULL;
UPDATE "Voucher" SET "minOrderValue" = round("minOrderValue");
UPDATE "Voucher" SET "maxDiscount" = round("maxDiscount") WHERE "maxDiscount" IS NOT NULL;
UPDATE "CashShift" SET
  "openingCash" = round("openingCash"),
  "cashSales" = round("cashSales"),
  "expectedCash" = round("expectedCash");
UPDATE "CashShift" SET "actualCash" = round("actualCash") WHERE "actualCash" IS NOT NULL;
UPDATE "CashShift" SET "discrepancy" = round("discrepancy") WHERE "discrepancy" IS NOT NULL;
UPDATE "ReturnOrder" SET "refundAmount" = round("refundAmount");
UPDATE "ReturnItem" SET "price" = round("price"), "refundAmount" = round("refundAmount");
UPDATE "HeldOrderItem" SET "price" = round("price");
UPDATE "OrderPayment" SET "amount" = round("amount");

ALTER TABLE "User" ADD CONSTRAINT "User_hourlyRate_whole_vnd"
  CHECK ("hourlyRate" >= 0 AND "hourlyRate" = trunc("hourlyRate"));
ALTER TABLE "Product" ADD CONSTRAINT "Product_price_whole_vnd"
  CHECK ("price" >= 0 AND "price" = trunc("price"));
ALTER TABLE "Order" ADD CONSTRAINT "Order_money_whole_vnd"
  CHECK (
    "subtotal" >= 0 AND "subtotal" = trunc("subtotal") AND
    "vatAmount" >= 0 AND "vatAmount" = trunc("vatAmount") AND
    "total" >= 0 AND "total" = trunc("total") AND
    COALESCE("discountAmount", 0) >= 0 AND COALESCE("discountAmount", 0) = trunc(COALESCE("discountAmount", 0)) AND
    COALESCE("orderDiscount", 0) >= 0 AND COALESCE("orderDiscount", 0) = trunc(COALESCE("orderDiscount", 0))
  );
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_money_whole_vnd"
  CHECK (
    "price" >= 0 AND "price" = trunc("price") AND
    COALESCE("discount", 0) >= 0 AND COALESCE("discount", 0) = trunc(COALESCE("discount", 0))
  );
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_cost_whole_vnd"
  CHECK ("cost" IS NULL OR ("cost" >= 0 AND "cost" = trunc("cost")));
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_money_whole_vnd"
  CHECK (
    "minOrderValue" >= 0 AND "minOrderValue" = trunc("minOrderValue") AND
    ("maxDiscount" IS NULL OR ("maxDiscount" >= 0 AND "maxDiscount" = trunc("maxDiscount"))) AND
    ("type" <> 'FIXED' OR ("value" >= 0 AND "value" = trunc("value")))
  );
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_money_whole_vnd"
  CHECK (
    "openingCash" >= 0 AND "openingCash" = trunc("openingCash") AND
    "cashSales" = trunc("cashSales") AND
    "expectedCash" = trunc("expectedCash") AND
    ("actualCash" IS NULL OR ("actualCash" >= 0 AND "actualCash" = trunc("actualCash"))) AND
    ("discrepancy" IS NULL OR "discrepancy" = trunc("discrepancy"))
  );
ALTER TABLE "ReturnOrder" ADD CONSTRAINT "ReturnOrder_refund_whole_vnd"
  CHECK ("refundAmount" >= 0 AND "refundAmount" = trunc("refundAmount"));
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_money_whole_vnd"
  CHECK (
    "price" >= 0 AND "price" = trunc("price") AND
    "refundAmount" >= 0 AND "refundAmount" = trunc("refundAmount")
  );
ALTER TABLE "HeldOrderItem" ADD CONSTRAINT "HeldOrderItem_price_whole_vnd"
  CHECK ("price" >= 0 AND "price" = trunc("price"));
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_amount_whole_vnd"
  CHECK ("amount" >= 0 AND "amount" = trunc("amount"));
