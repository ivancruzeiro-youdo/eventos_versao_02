-- CreateTable
CREATE TABLE "VenueQuestion" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventVenueAnswer" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "EventVenueAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventVenueAnswerHistory" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventVenueAnswerHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VenueQuestion_venueId_idx" ON "VenueQuestion"("venueId");

-- CreateIndex
CREATE INDEX "EventVenueAnswer_eventId_idx" ON "EventVenueAnswer"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventVenueAnswer_eventId_questionId_key" ON "EventVenueAnswer"("eventId", "questionId");

-- CreateIndex
CREATE INDEX "EventVenueAnswerHistory_answerId_idx" ON "EventVenueAnswerHistory"("answerId");

-- AddForeignKey
ALTER TABLE "VenueQuestion" ADD CONSTRAINT "VenueQuestion_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVenueAnswer" ADD CONSTRAINT "EventVenueAnswer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVenueAnswer" ADD CONSTRAINT "EventVenueAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "VenueQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVenueAnswer" ADD CONSTRAINT "EventVenueAnswer_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVenueAnswerHistory" ADD CONSTRAINT "EventVenueAnswerHistory_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "EventVenueAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVenueAnswerHistory" ADD CONSTRAINT "EventVenueAnswerHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
