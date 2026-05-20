-- DropForeignKey
ALTER TABLE "EventService" DROP CONSTRAINT "EventService_serviceId_fkey";

-- AlterTable
ALTER TABLE "EventService" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "endAt" TIMESTAMP(3),
ADD COLUMN     "maxSlots" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "startAt" TIMESTAMP(3),
ADD COLUMN     "valuePerHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "status" SET DEFAULT 'active';

-- AddForeignKey
ALTER TABLE "EventService" ADD CONSTRAINT "EventService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "FreelancerService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
