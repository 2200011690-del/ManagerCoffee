CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");
ALTER TABLE "Store" ADD COLUMN "organizationId" TEXT;

INSERT INTO "Organization" ("id", "name", "code", "createdAt")
SELECT 'org_' || "id", "name", "code", "createdAt" FROM "Store";
UPDATE "Store" SET "organizationId" = 'org_' || "id";
ALTER TABLE "Store" ALTER COLUMN "organizationId" SET NOT NULL;
CREATE INDEX "Store_organizationId_idx" ON "Store"("organizationId");
ALTER TABLE "Store" ADD CONSTRAINT "Store_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "User_email_key";
CREATE UNIQUE INDEX "User_storeId_email_key" ON "User"("storeId", "email");
