CREATE TABLE IF NOT EXISTS "EventCheckinLimit" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "warningSentAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventCheckinLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventCheckinLimit_eventId_key" ON "EventCheckinLimit"("eventId");

ALTER TABLE "EventCheckinLimit" ADD CONSTRAINT "EventCheckinLimit_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "EventCheckinRelease" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "extraGuests" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "releasedById" TEXT,
    "releasedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventCheckinRelease_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventCheckinRelease_eventId_idx" ON "EventCheckinRelease"("eventId");

ALTER TABLE "EventCheckinRelease" ADD CONSTRAINT "EventCheckinRelease_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
