/*
  Warnings:

  - A unique constraint covering the columns `[externalId]` on the table `Venue` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Venue_externalId_key" ON "Venue"("externalId");
