-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "descriptionLong" TEXT,
    "price" DOUBLE PRECISION,
    "categoryId" TEXT,
    "categoryName" TEXT,
    "unitId" TEXT,
    "unitName" TEXT,
    "unitAbbr" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_externalId_key" ON "Product"("externalId");

-- CreateIndex
CREATE INDEX "Product_categoryName_idx" ON "Product"("categoryName");
