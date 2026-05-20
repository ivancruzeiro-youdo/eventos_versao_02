-- DropIndex
DROP INDEX "EventChecklist_eventId_key";

-- CreateIndex
CREATE INDEX "EventChecklist_eventId_idx" ON "EventChecklist"("eventId");
