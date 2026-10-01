CREATE TABLE IF NOT EXISTS "EventItemRemovalSnapshot" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "serviceStartAt" TIMESTAMP(3),
    "serviceEndAt" TIMESTAMP(3),
    "answers" JSONB NOT NULL,
    "choices" JSONB NOT NULL,
    "serviceWindows" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventItemRemovalSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventItemRemovalSnapshot_eventId_name_idx" ON "EventItemRemovalSnapshot"("eventId", "name");

ALTER TABLE "EventItemRemovalSnapshot" ADD CONSTRAINT "EventItemRemovalSnapshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
