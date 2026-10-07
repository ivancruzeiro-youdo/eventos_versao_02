CREATE TABLE IF NOT EXISTS "EventContractArchive" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "contractExternalId" TEXT NOT NULL,
    "contract" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonDetail" JSONB,
    "eventStatusBefore" TEXT,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedById" TEXT,
    "archivedByName" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredByName" TEXT,

    CONSTRAINT "EventContractArchive_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventContractArchive_eventId_idx" ON "EventContractArchive"("eventId");
CREATE INDEX IF NOT EXISTS "EventContractArchive_contractExternalId_idx" ON "EventContractArchive"("contractExternalId");

ALTER TABLE "EventContractArchive" ADD CONSTRAINT "EventContractArchive_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
