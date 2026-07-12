-- Add serviceId to File (slot-level attachments)
ALTER TABLE "File" ADD COLUMN "serviceId" TEXT;
ALTER TABLE "File" ADD CONSTRAINT "File_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "EventService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "File_serviceId_idx" ON "File"("serviceId");

-- New join table: EventServiceChecklist
CREATE TABLE "EventServiceChecklist" (
  "serviceId"   TEXT NOT NULL,
  "checklistId" TEXT NOT NULL,
  CONSTRAINT "EventServiceChecklist_pkey" PRIMARY KEY ("serviceId", "checklistId"),
  CONSTRAINT "EventServiceChecklist_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "EventService"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EventServiceChecklist_checklistId_fkey"
    FOREIGN KEY ("checklistId") REFERENCES "EventChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
