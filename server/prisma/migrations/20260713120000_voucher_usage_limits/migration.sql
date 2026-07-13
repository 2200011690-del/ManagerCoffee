ALTER TABLE "Voucher"
  ADD COLUMN "maxUses" INTEGER,
  ADD COLUMN "maxUsesPerCustomer" INTEGER,
  ADD COLUMN "usedCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "VoucherRedemption" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "voucherId" TEXT,
  "voucherCode" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "customerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoucherRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VoucherRedemption_orderId_key" ON "VoucherRedemption"("orderId");
CREATE INDEX "VoucherRedemption_storeId_voucherCode_createdAt_idx" ON "VoucherRedemption"("storeId", "voucherCode", "createdAt");
CREATE INDEX "VoucherRedemption_voucherId_customerId_idx" ON "VoucherRedemption"("voucherId", "customerId");

ALTER TABLE "VoucherRedemption" ADD CONSTRAINT "VoucherRedemption_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoucherRedemption" ADD CONSTRAINT "VoucherRedemption_voucherId_fkey"
  FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VoucherRedemption" ADD CONSTRAINT "VoucherRedemption_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoucherRedemption" ADD CONSTRAINT "VoucherRedemption_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
