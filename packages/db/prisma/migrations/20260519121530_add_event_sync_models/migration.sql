-- CreateTable
CREATE TABLE "EventContract" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "clientCode" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "rawJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventItem" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "productId" TEXT,
    "venueId" TEXT,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventItemChoice" (
    "id" TEXT NOT NULL,
    "eventItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "chosen" TEXT[],
    "maxChoices" INTEGER,

    CONSTRAINT "EventItemChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventStaffSlot" (
    "id" TEXT NOT NULL,
    "eventItemId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "filledCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventStaffSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSyncLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "action" TEXT NOT NULL,
    "diff" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggeredBy" TEXT,

    CONSTRAINT "EventSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventContract_eventId_idx" ON "EventContract"("eventId");

-- CreateIndex
CREATE INDEX "EventContract_clientCode_startDate_idx" ON "EventContract"("clientCode", "startDate");

-- CreateIndex
CREATE INDEX "EventItem_eventId_idx" ON "EventItem"("eventId");

-- CreateIndex
CREATE INDEX "EventItemChoice_eventItemId_idx" ON "EventItemChoice"("eventItemId");

-- CreateIndex
CREATE INDEX "EventStaffSlot_eventItemId_idx" ON "EventStaffSlot"("eventItemId");

-- CreateIndex
CREATE INDEX "EventSyncLog_eventId_idx" ON "EventSyncLog"("eventId");

-- AddForeignKey
ALTER TABLE "EventContract" ADD CONSTRAINT "EventContract_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventItem" ADD CONSTRAINT "EventItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventItemChoice" ADD CONSTRAINT "EventItemChoice_eventItemId_fkey" FOREIGN KEY ("eventItemId") REFERENCES "EventItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaffSlot" ADD CONSTRAINT "EventStaffSlot_eventItemId_fkey" FOREIGN KEY ("eventItemId") REFERENCES "EventItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSyncLog" ADD CONSTRAINT "EventSyncLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
