-- Portal do cliente: token de acesso e número de reserva no evento
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "clientToken" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "reservationNumber" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Event_clientToken_key" ON "Event"("clientToken");

-- Visibilidade de arquivos para o cliente
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "visibleToClient" BOOLEAN NOT NULL DEFAULT false;
