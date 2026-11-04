CREATE TABLE "EventAlignmentMeeting" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'in_progress',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "startedById" TEXT,
  "startedByName" TEXT,
  "participants" JSONB NOT NULL,
  "currentStep" INTEGER NOT NULL DEFAULT 0,
  "summary" JSONB,
  CONSTRAINT "EventAlignmentMeeting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventAlignmentMeeting_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EventAlignmentMeeting_eventId_status_idx" ON "EventAlignmentMeeting"("eventId", "status");
