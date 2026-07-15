ALTER TABLE "EventComment" ADD COLUMN IF NOT EXISTS "eventScheduleId" TEXT;

ALTER TABLE "EventComment" ADD CONSTRAINT "EventComment_eventScheduleId_fkey"
  FOREIGN KEY ("eventScheduleId") REFERENCES "EventSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "EventComment_eventScheduleId_idx" ON "EventComment"("eventScheduleId");
