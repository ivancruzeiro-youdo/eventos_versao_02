-- AlterTable
ALTER TABLE "Freelancer" ADD COLUMN     "birthDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FreelancerService" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreelancerService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreelancerServiceLink" (
    "id" TEXT NOT NULL,
    "freelancerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreelancerServiceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductServiceLink" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductServiceLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FreelancerServiceLink_freelancerId_idx" ON "FreelancerServiceLink"("freelancerId");

-- CreateIndex
CREATE INDEX "FreelancerServiceLink_serviceId_idx" ON "FreelancerServiceLink"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "FreelancerServiceLink_freelancerId_serviceId_key" ON "FreelancerServiceLink"("freelancerId", "serviceId");

-- CreateIndex
CREATE INDEX "ProductServiceLink_productId_idx" ON "ProductServiceLink"("productId");

-- CreateIndex
CREATE INDEX "ProductServiceLink_serviceId_idx" ON "ProductServiceLink"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductServiceLink_productId_serviceId_key" ON "ProductServiceLink"("productId", "serviceId");

-- AddForeignKey
ALTER TABLE "FreelancerServiceLink" ADD CONSTRAINT "FreelancerServiceLink_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "Freelancer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreelancerServiceLink" ADD CONSTRAINT "FreelancerServiceLink_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "FreelancerService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductServiceLink" ADD CONSTRAINT "ProductServiceLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductServiceLink" ADD CONSTRAINT "ProductServiceLink_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "FreelancerService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
