-- AlterTable: adiciona fotoBase64 ao Freelancer
ALTER TABLE "Freelancer" ADD COLUMN "fotoBase64" TEXT;

-- CreateTable: mapeamento serviço → acesso externo
CREATE TABLE "ServiceAcessoMapping" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "acessoId" TEXT NOT NULL,
    "acessoNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceAcessoMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable: log de cada chamada à API de acessos
CREATE TABLE "AcessoLog" (
    "id" TEXT NOT NULL,
    "freelancerId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "acessoExternoId" TEXT,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcessoLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceAcessoMapping_serviceId_idx" ON "ServiceAcessoMapping"("serviceId");
CREATE UNIQUE INDEX "ServiceAcessoMapping_serviceId_acessoId_key" ON "ServiceAcessoMapping"("serviceId", "acessoId");

-- CreateIndex
CREATE INDEX "AcessoLog_freelancerId_idx" ON "AcessoLog"("freelancerId");
CREATE INDEX "AcessoLog_applicationId_idx" ON "AcessoLog"("applicationId");
CREATE INDEX "AcessoLog_status_idx" ON "AcessoLog"("status");

-- AddForeignKey
ALTER TABLE "ServiceAcessoMapping" ADD CONSTRAINT "ServiceAcessoMapping_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "FreelancerService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcessoLog" ADD CONSTRAINT "AcessoLog_freelancerId_fkey"
    FOREIGN KEY ("freelancerId") REFERENCES "Freelancer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcessoLog" ADD CONSTRAINT "AcessoLog_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "FreelancerApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
