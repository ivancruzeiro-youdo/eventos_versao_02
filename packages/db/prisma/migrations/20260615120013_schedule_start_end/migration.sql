-- DropIndex
DROP INDEX "EventSchedule_scheduledAt_idx";

-- AlterTable: add new columns as nullable first
ALTER TABLE "EventSchedule"
ADD COLUMN     "startAt" TIMESTAMP(3),
ADD COLUMN     "endAt" TIMESTAMP(3);

-- Backfill from the old scheduledAt column (start = scheduledAt, end = +1h)
UPDATE "EventSchedule"
SET "startAt" = "scheduledAt",
    "endAt" = "scheduledAt" + INTERVAL '1 hour'
WHERE "startAt" IS NULL;

-- Enforce NOT NULL now that data is backfilled
ALTER TABLE "EventSchedule"
ALTER COLUMN "startAt" SET NOT NULL,
ALTER COLUMN "endAt" SET NOT NULL;

-- Drop the old column
ALTER TABLE "EventSchedule" DROP COLUMN "scheduledAt";

-- CreateIndex
CREATE INDEX "EventSchedule_startAt_idx" ON "EventSchedule"("startAt");
