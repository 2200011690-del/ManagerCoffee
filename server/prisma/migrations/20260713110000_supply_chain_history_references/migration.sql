ALTER TABLE "PurchaseOrderItem"
  DROP CONSTRAINT "PurchaseOrderItem_inventoryId_fkey",
  ALTER COLUMN "inventoryId" DROP NOT NULL,
  ADD CONSTRAINT "PurchaseOrderItem_inventoryId_fkey"
    FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StocktakeItem"
  DROP CONSTRAINT "StocktakeItem_inventoryId_fkey",
  ALTER COLUMN "inventoryId" DROP NOT NULL,
  ADD CONSTRAINT "StocktakeItem_inventoryId_fkey"
    FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryTransferItem"
  DROP CONSTRAINT "InventoryTransferItem_sourceInventoryId_fkey",
  ALTER COLUMN "sourceInventoryId" DROP NOT NULL,
  ADD CONSTRAINT "InventoryTransferItem_sourceInventoryId_fkey"
    FOREIGN KEY ("sourceInventoryId") REFERENCES "Inventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
