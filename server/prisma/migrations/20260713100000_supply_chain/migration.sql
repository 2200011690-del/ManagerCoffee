CREATE TABLE "PurchaseOrder" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "supplierId" TEXT,
  "number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "expectedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "note" TEXT,
  "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrderItem" (
  "id" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "inventoryId" TEXT NOT NULL,
  "inventoryName" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "orderedQty" DOUBLE PRECISION NOT NULL,
  "receivedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unitCost" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Stocktake" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "note" TEXT,
  "postedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Stocktake_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StocktakeItem" (
  "id" TEXT NOT NULL,
  "stocktakeId" TEXT NOT NULL,
  "inventoryId" TEXT NOT NULL,
  "inventoryName" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "expectedQty" DOUBLE PRECISION NOT NULL,
  "countedQty" DOUBLE PRECISION NOT NULL,
  "variance" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "StocktakeItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryTransfer" (
  "id" TEXT NOT NULL,
  "sourceStoreId" TEXT NOT NULL,
  "destinationStoreId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "note" TEXT,
  "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryTransferItem" (
  "id" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "sourceInventoryId" TEXT NOT NULL,
  "inventoryName" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "qty" DOUBLE PRECISION NOT NULL,
  "unitCost" DOUBLE PRECISION,
  CONSTRAINT "InventoryTransferItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseOrder_storeId_number_key" ON "PurchaseOrder"("storeId", "number");
CREATE INDEX "PurchaseOrder_storeId_status_createdAt_idx" ON "PurchaseOrder"("storeId", "status", "createdAt");
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");
CREATE INDEX "PurchaseOrderItem_inventoryId_idx" ON "PurchaseOrderItem"("inventoryId");
CREATE UNIQUE INDEX "Stocktake_storeId_number_key" ON "Stocktake"("storeId", "number");
CREATE INDEX "Stocktake_storeId_status_createdAt_idx" ON "Stocktake"("storeId", "status", "createdAt");
CREATE INDEX "StocktakeItem_stocktakeId_idx" ON "StocktakeItem"("stocktakeId");
CREATE INDEX "StocktakeItem_inventoryId_idx" ON "StocktakeItem"("inventoryId");
CREATE UNIQUE INDEX "InventoryTransfer_sourceStoreId_number_key" ON "InventoryTransfer"("sourceStoreId", "number");
CREATE INDEX "InventoryTransfer_sourceStoreId_status_createdAt_idx" ON "InventoryTransfer"("sourceStoreId", "status", "createdAt");
CREATE INDEX "InventoryTransfer_destinationStoreId_status_createdAt_idx" ON "InventoryTransfer"("destinationStoreId", "status", "createdAt");
CREATE INDEX "InventoryTransferItem_transferId_idx" ON "InventoryTransferItem"("transferId");
CREATE INDEX "InventoryTransferItem_sourceInventoryId_idx" ON "InventoryTransferItem"("sourceInventoryId");

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StocktakeItem" ADD CONSTRAINT "StocktakeItem_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StocktakeItem" ADD CONSTRAINT "StocktakeItem_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_sourceStoreId_fkey" FOREIGN KEY ("sourceStoreId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_destinationStoreId_fkey" FOREIGN KEY ("destinationStoreId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryTransferItem" ADD CONSTRAINT "InventoryTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "InventoryTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryTransferItem" ADD CONSTRAINT "InventoryTransferItem_sourceInventoryId_fkey" FOREIGN KEY ("sourceInventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
