-- Espelha ParkingEntry: registro de presente do convidado (foto obrigatória, um por convidado).
CREATE TABLE IF NOT EXISTS "GiftEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "photoS3Key" TEXT NOT NULL,
    "registeredById" TEXT,
    "registeredByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GiftEntry_eventId_idx" ON "GiftEntry"("eventId");
CREATE INDEX IF NOT EXISTS "GiftEntry_guestId_idx" ON "GiftEntry"("guestId");

ALTER TABLE "GiftEntry" ADD CONSTRAINT "GiftEntry_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftEntry" ADD CONSTRAINT "GiftEntry_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
