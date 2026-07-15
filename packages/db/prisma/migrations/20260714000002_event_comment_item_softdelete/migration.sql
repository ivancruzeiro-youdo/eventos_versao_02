ALTER TABLE "EventComment" ADD COLUMN "eventItemId" TEXT;
ALTER TABLE "EventComment" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "EventComment" ADD COLUMN "deletedById" TEXT;

ALTER TABLE "EventComment" ADD CONSTRAINT "EventComment_eventItemId_fkey"
  FOREIGN KEY ("eventItemId") REFERENCES "EventItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventComment" ADD CONSTRAINT "EventComment_deletedById_fkey"
  FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "EventComment_eventItemId_idx" ON "EventComment"("eventItemId");
