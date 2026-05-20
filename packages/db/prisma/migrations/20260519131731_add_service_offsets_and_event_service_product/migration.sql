-- AlterTable
ALTER TABLE "EventService" ADD COLUMN     "productName" TEXT;

-- AlterTable
ALTER TABLE "FreelancerService" ADD COLUMN     "endOffsetMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "startOffsetMinutes" INTEGER NOT NULL DEFAULT -60;
