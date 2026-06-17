-- Add Userp SSO fields to User
ALTER TABLE "User" ADD COLUMN "userpCodigo" TEXT;
ALTER TABLE "User" ADD COLUMN "userpTipo"   TEXT;

CREATE UNIQUE INDEX "User_userpCodigo_key" ON "User"("userpCodigo") WHERE "userpCodigo" IS NOT NULL;
CREATE INDEX        "User_userpCodigo_idx" ON "User"("userpCodigo");
