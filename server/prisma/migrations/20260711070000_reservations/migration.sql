CREATE TABLE "Reservation" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "tableId" TEXT,
  "customerName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "guestCount" INTEGER NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'confirmed',
  "depositAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "depositStatus" TEXT NOT NULL DEFAULT 'unpaid',
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Reservation_guestCount_positive" CHECK ("guestCount" > 0),
  CONSTRAINT "Reservation_time_range" CHECK ("endAt" > "startAt"),
  CONSTRAINT "Reservation_deposit_whole_vnd" CHECK ("depositAmount" >= 0 AND "depositAmount" = trunc("depositAmount")),
  CONSTRAINT "Reservation_status_check" CHECK ("status" IN ('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show')),
  CONSTRAINT "Reservation_deposit_status_check" CHECK ("depositStatus" IN ('unpaid', 'paid', 'refunded', 'forfeited'))
);

CREATE INDEX "Reservation_storeId_startAt_idx" ON "Reservation"("storeId", "startAt");
CREATE INDEX "Reservation_tableId_startAt_endAt_idx" ON "Reservation"("tableId", "startAt", "endAt");
CREATE INDEX "Reservation_storeId_status_idx" ON "Reservation"("storeId", "status");

ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
