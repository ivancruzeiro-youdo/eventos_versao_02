CREATE TABLE "EventClosureRemovedCharge" (
  "id" TEXT NOT NULL,
  "closureId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "unitValue" DOUBLE PRECISION NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "reason" TEXT NOT NULL,
  "removedById" TEXT,
  "removedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventClosureRemovedCharge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventClosureRemovedCharge_closureId_fkey" FOREIGN KEY ("closureId") REFERENCES "EventClosure"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EventClosureRemovedCharge_closureId_idx" ON "EventClosureRemovedCharge"("closureId");
