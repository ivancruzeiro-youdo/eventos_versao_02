-- AlterTable
ALTER TABLE "PlanQuestion" ADD COLUMN "sourceTemplateId" TEXT;

-- CreateIndex
CREATE INDEX "PlanQuestion_sourceTemplateId_idx" ON "PlanQuestion"("sourceTemplateId");
