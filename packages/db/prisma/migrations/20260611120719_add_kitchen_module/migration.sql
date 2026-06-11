-- CreateEnum
CREATE TYPE "KitchenStorageType" AS ENUM ('dry', 'frozen', 'refrigerated');

-- CreateEnum
CREATE TYPE "KitchenMenuType" AS ENUM ('guest', 'staff');

-- CreateEnum
CREATE TYPE "KitchenPurchaseSource" AS ENUM ('foto', 'manual');

-- CreateTable
CREATE TABLE "KitchenIngredient" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "costPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stockQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storageType" "KitchenStorageType" NOT NULL DEFAULT 'dry',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenRecipe" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "recipeType" TEXT NOT NULL DEFAULT 'final',
    "servings" INTEGER NOT NULL DEFAULT 1,
    "averagePerGuest" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prepTime" INTEGER NOT NULL DEFAULT 0,
    "validityHours" INTEGER NOT NULL DEFAULT 48,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenRecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "KitchenRecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenSubRecipe" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "subRecipeId" TEXT NOT NULL,
    "servingsUsed" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "KitchenSubRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenRecipeStep" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "imageKey" TEXT,

    CONSTRAINT "KitchenRecipeStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenEventMenu" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "eventItemId" TEXT,
    "menuType" "KitchenMenuType" NOT NULL DEFAULT 'guest',
    "servingsNeeded" INTEGER NOT NULL DEFAULT 0,
    "leftovers" DOUBLE PRECISION,
    "breakage" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenEventMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenProductionLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "portionsProduced" DOUBLE PRECISION NOT NULL,
    "producedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitchenProductionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenPurchaseRecord" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "eventId" TEXT,
    "storeName" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" "KitchenPurchaseSource" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitchenPurchaseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenPurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseRecordId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "KitchenPurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenLaborRole" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dailyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenLaborRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenEventLabor" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "laborRoleId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "days" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitchenEventLabor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenEventPlan" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenEventPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenProductionBatch" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "targetQty" DOUBLE PRECISION NOT NULL,
    "producedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenBatchAllocation" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "menuId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "KitchenBatchAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenProductionPlan" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "windowDays" INTEGER NOT NULL DEFAULT 30,
    "aiModel" TEXT,
    "aiNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenProductionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenProductionPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "phase" TEXT NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validityHours" INTEGER NOT NULL DEFAULT 48,
    "reasoning" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenProductionPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenProductionAllocation" (
    "id" TEXT NOT NULL,
    "planItemId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "costShare" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "KitchenProductionAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KitchenIngredient_employerId_idx" ON "KitchenIngredient"("employerId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenIngredient_employerId_name_unit_key" ON "KitchenIngredient"("employerId", "name", "unit");

-- CreateIndex
CREATE INDEX "KitchenRecipe_employerId_idx" ON "KitchenRecipe"("employerId");

-- CreateIndex
CREATE INDEX "KitchenRecipe_productId_idx" ON "KitchenRecipe"("productId");

-- CreateIndex
CREATE INDEX "KitchenRecipeIngredient_recipeId_idx" ON "KitchenRecipeIngredient"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenRecipeIngredient_recipeId_ingredientId_key" ON "KitchenRecipeIngredient"("recipeId", "ingredientId");

-- CreateIndex
CREATE INDEX "KitchenSubRecipe_parentId_idx" ON "KitchenSubRecipe"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenSubRecipe_parentId_subRecipeId_key" ON "KitchenSubRecipe"("parentId", "subRecipeId");

-- CreateIndex
CREATE INDEX "KitchenRecipeStep_recipeId_idx" ON "KitchenRecipeStep"("recipeId");

-- CreateIndex
CREATE INDEX "KitchenEventMenu_eventId_idx" ON "KitchenEventMenu"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenEventMenu_eventId_recipeId_menuType_key" ON "KitchenEventMenu"("eventId", "recipeId", "menuType");

-- CreateIndex
CREATE INDEX "KitchenProductionLog_eventId_idx" ON "KitchenProductionLog"("eventId");

-- CreateIndex
CREATE INDEX "KitchenProductionLog_recipeId_idx" ON "KitchenProductionLog"("recipeId");

-- CreateIndex
CREATE INDEX "KitchenPurchaseRecord_employerId_idx" ON "KitchenPurchaseRecord"("employerId");

-- CreateIndex
CREATE INDEX "KitchenPurchaseRecord_eventId_idx" ON "KitchenPurchaseRecord"("eventId");

-- CreateIndex
CREATE INDEX "KitchenPurchaseItem_purchaseRecordId_idx" ON "KitchenPurchaseItem"("purchaseRecordId");

-- CreateIndex
CREATE INDEX "KitchenLaborRole_employerId_idx" ON "KitchenLaborRole"("employerId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenLaborRole_employerId_name_key" ON "KitchenLaborRole"("employerId", "name");

-- CreateIndex
CREATE INDEX "KitchenEventLabor_eventId_idx" ON "KitchenEventLabor"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenEventLabor_eventId_laborRoleId_key" ON "KitchenEventLabor"("eventId", "laborRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenEventPlan_eventId_key" ON "KitchenEventPlan"("eventId");

-- CreateIndex
CREATE INDEX "KitchenEventPlan_employerId_idx" ON "KitchenEventPlan"("employerId");

-- CreateIndex
CREATE INDEX "KitchenEventPlan_status_idx" ON "KitchenEventPlan"("status");

-- CreateIndex
CREATE INDEX "KitchenProductionBatch_employerId_idx" ON "KitchenProductionBatch"("employerId");

-- CreateIndex
CREATE INDEX "KitchenProductionBatch_recipeId_idx" ON "KitchenProductionBatch"("recipeId");

-- CreateIndex
CREATE INDEX "KitchenProductionBatch_scheduledAt_idx" ON "KitchenProductionBatch"("scheduledAt");

-- CreateIndex
CREATE INDEX "KitchenBatchAllocation_batchId_idx" ON "KitchenBatchAllocation"("batchId");

-- CreateIndex
CREATE INDEX "KitchenBatchAllocation_eventId_idx" ON "KitchenBatchAllocation"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenBatchAllocation_batchId_eventId_key" ON "KitchenBatchAllocation"("batchId", "eventId");

-- CreateIndex
CREATE INDEX "KitchenProductionPlan_employerId_idx" ON "KitchenProductionPlan"("employerId");

-- CreateIndex
CREATE INDEX "KitchenProductionPlan_status_idx" ON "KitchenProductionPlan"("status");

-- CreateIndex
CREATE INDEX "KitchenProductionPlan_createdAt_idx" ON "KitchenProductionPlan"("createdAt");

-- CreateIndex
CREATE INDEX "KitchenProductionPlanItem_planId_idx" ON "KitchenProductionPlanItem"("planId");

-- CreateIndex
CREATE INDEX "KitchenProductionPlanItem_recipeId_idx" ON "KitchenProductionPlanItem"("recipeId");

-- CreateIndex
CREATE INDEX "KitchenProductionPlanItem_scheduledDate_idx" ON "KitchenProductionPlanItem"("scheduledDate");

-- CreateIndex
CREATE INDEX "KitchenProductionAllocation_planItemId_idx" ON "KitchenProductionAllocation"("planItemId");

-- CreateIndex
CREATE INDEX "KitchenProductionAllocation_eventId_idx" ON "KitchenProductionAllocation"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenProductionAllocation_planItemId_eventId_key" ON "KitchenProductionAllocation"("planItemId", "eventId");

-- AddForeignKey
ALTER TABLE "KitchenIngredient" ADD CONSTRAINT "KitchenIngredient_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenRecipe" ADD CONSTRAINT "KitchenRecipe_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenRecipe" ADD CONSTRAINT "KitchenRecipe_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenRecipeIngredient" ADD CONSTRAINT "KitchenRecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "KitchenRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenRecipeIngredient" ADD CONSTRAINT "KitchenRecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "KitchenIngredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenSubRecipe" ADD CONSTRAINT "KitchenSubRecipe_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KitchenRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenSubRecipe" ADD CONSTRAINT "KitchenSubRecipe_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "KitchenRecipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenRecipeStep" ADD CONSTRAINT "KitchenRecipeStep_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "KitchenRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenEventMenu" ADD CONSTRAINT "KitchenEventMenu_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenEventMenu" ADD CONSTRAINT "KitchenEventMenu_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "KitchenRecipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenEventMenu" ADD CONSTRAINT "KitchenEventMenu_eventItemId_fkey" FOREIGN KEY ("eventItemId") REFERENCES "EventItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenProductionLog" ADD CONSTRAINT "KitchenProductionLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenProductionLog" ADD CONSTRAINT "KitchenProductionLog_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "KitchenRecipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenPurchaseRecord" ADD CONSTRAINT "KitchenPurchaseRecord_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenPurchaseItem" ADD CONSTRAINT "KitchenPurchaseItem_purchaseRecordId_fkey" FOREIGN KEY ("purchaseRecordId") REFERENCES "KitchenPurchaseRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenPurchaseItem" ADD CONSTRAINT "KitchenPurchaseItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "KitchenIngredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenLaborRole" ADD CONSTRAINT "KitchenLaborRole_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenEventLabor" ADD CONSTRAINT "KitchenEventLabor_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenEventLabor" ADD CONSTRAINT "KitchenEventLabor_laborRoleId_fkey" FOREIGN KEY ("laborRoleId") REFERENCES "KitchenLaborRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenEventPlan" ADD CONSTRAINT "KitchenEventPlan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenEventPlan" ADD CONSTRAINT "KitchenEventPlan_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenProductionBatch" ADD CONSTRAINT "KitchenProductionBatch_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenProductionBatch" ADD CONSTRAINT "KitchenProductionBatch_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "KitchenRecipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenBatchAllocation" ADD CONSTRAINT "KitchenBatchAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "KitchenProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenBatchAllocation" ADD CONSTRAINT "KitchenBatchAllocation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenProductionPlan" ADD CONSTRAINT "KitchenProductionPlan_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenProductionPlanItem" ADD CONSTRAINT "KitchenProductionPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "KitchenProductionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenProductionPlanItem" ADD CONSTRAINT "KitchenProductionPlanItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "KitchenRecipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenProductionAllocation" ADD CONSTRAINT "KitchenProductionAllocation_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "KitchenProductionPlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenProductionAllocation" ADD CONSTRAINT "KitchenProductionAllocation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

