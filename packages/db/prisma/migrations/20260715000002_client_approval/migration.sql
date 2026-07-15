CREATE TABLE IF NOT EXISTS "ClientApproval" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "eventId"    TEXT NOT NULL,
  "itemType"   TEXT NOT NULL,  -- 'plan' | 'schedule'
  "itemId"     TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip"         TEXT,
  "userAgent"  TEXT,

  CONSTRAINT "ClientApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientApproval_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClientApproval_unique"
    UNIQUE ("eventId", "itemType", "itemId")
);

CREATE INDEX IF NOT EXISTS "ClientApproval_eventId_idx" ON "ClientApproval"("eventId");
