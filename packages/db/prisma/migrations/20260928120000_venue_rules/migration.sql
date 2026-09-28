CREATE TABLE "VenueRule" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VenueRule_venueId_idx" ON "VenueRule"("venueId");

ALTER TABLE "VenueRule" ADD CONSTRAINT "VenueRule_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VenueRuleAcceptance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "VenueRuleAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VenueRuleAcceptance_eventId_key" ON "VenueRuleAcceptance"("eventId");

ALTER TABLE "VenueRuleAcceptance" ADD CONSTRAINT "VenueRuleAcceptance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
