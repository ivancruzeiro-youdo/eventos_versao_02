-- Usuário vinculado ao contrato no Userp (tb_loca_contrato_usuarios + tb_usuarios) — model
-- adicionado ao schema.prisma no commit 040e461 sem a migration correspondente.
CREATE TABLE IF NOT EXISTS "EventContractUser" (
    "id" TEXT NOT NULL,
    "eventContractId" TEXT NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "contUserId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "documento" TEXT,
    "acessaApp" BOOLEAN NOT NULL DEFAULT false,
    "acessaUnidade" BOOLEAN NOT NULL DEFAULT false,
    "acessoConsultivo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventContractUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventContractUser_eventContractId_usuarioId_key" ON "EventContractUser"("eventContractId", "usuarioId");

CREATE INDEX IF NOT EXISTS "EventContractUser_eventContractId_idx" ON "EventContractUser"("eventContractId");

ALTER TABLE "EventContractUser" ADD CONSTRAINT "EventContractUser_eventContractId_fkey"
  FOREIGN KEY ("eventContractId") REFERENCES "EventContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
