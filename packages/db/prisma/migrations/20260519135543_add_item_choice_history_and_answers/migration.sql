-- AlterTable
ALTER TABLE "EventItemChoice" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT;

-- CreateTable
CREATE TABLE "EventItemChoiceHistory" (
    "id" TEXT NOT NULL,
    "choiceId" TEXT NOT NULL,
    "before" TEXT[],
    "after" TEXT[],
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventItemChoiceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventItemAnswer" (
    "id" TEXT NOT NULL,
    "eventItemId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "EventItemAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventItemAnswerHistory" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventItemAnswerHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventItemChoiceHistory_choiceId_idx" ON "EventItemChoiceHistory"("choiceId");

-- CreateIndex
CREATE INDEX "EventItemChoiceHistory_createdAt_idx" ON "EventItemChoiceHistory"("createdAt");

-- CreateIndex
CREATE INDEX "EventItemAnswer_eventItemId_idx" ON "EventItemAnswer"("eventItemId");

-- CreateIndex
CREATE UNIQUE INDEX "EventItemAnswer_eventItemId_questionId_key" ON "EventItemAnswer"("eventItemId", "questionId");

-- CreateIndex
CREATE INDEX "EventItemAnswerHistory_answerId_idx" ON "EventItemAnswerHistory"("answerId");

-- CreateIndex
CREATE INDEX "EventItemAnswerHistory_createdAt_idx" ON "EventItemAnswerHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "EventItemChoice" ADD CONSTRAINT "EventItemChoice_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventItemChoiceHistory" ADD CONSTRAINT "EventItemChoiceHistory_choiceId_fkey" FOREIGN KEY ("choiceId") REFERENCES "EventItemChoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventItemChoiceHistory" ADD CONSTRAINT "EventItemChoiceHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventItemAnswer" ADD CONSTRAINT "EventItemAnswer_eventItemId_fkey" FOREIGN KEY ("eventItemId") REFERENCES "EventItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventItemAnswer" ADD CONSTRAINT "EventItemAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ProductQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventItemAnswer" ADD CONSTRAINT "EventItemAnswer_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventItemAnswerHistory" ADD CONSTRAINT "EventItemAnswerHistory_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "EventItemAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventItemAnswerHistory" ADD CONSTRAINT "EventItemAnswerHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
