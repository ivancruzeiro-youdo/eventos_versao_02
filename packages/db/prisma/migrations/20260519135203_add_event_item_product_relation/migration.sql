-- CreateIndex
CREATE INDEX "EventItem_productId_idx" ON "EventItem"("productId");

-- AddForeignKey
ALTER TABLE "EventItem" ADD CONSTRAINT "EventItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
