-- Integração da Degustação ao sistema de Eventos. Cada degustação É um Event de verdade —
-- estas 3 tabelas guardam só o que é EXTRA de uma degustação (mesmo padrão de EventClosure/
-- KitchenEventPlan: lateral 1:1, não campo em Event). Migração puramente aditiva.

CREATE TABLE IF NOT EXISTS "Degustacao" (
  "id"                 TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "eventId"            TEXT NOT NULL,
  "visibility"         TEXT NOT NULL,
  "productId"          TEXT,
  "maxGuests"          INTEGER NOT NULL DEFAULT 4,
  "seriesId"           TEXT,
  "seriesIndex"        INTEGER,
  "seriesIntervalDays" INTEGER,
  "createdById"        TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Degustacao_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Degustacao_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Degustacao_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Degustacao_eventId_key" ON "Degustacao"("eventId");
CREATE INDEX IF NOT EXISTS "Degustacao_seriesId_idx" ON "Degustacao"("seriesId");

CREATE TABLE IF NOT EXISTS "DegustacaoLink" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "degustacaoId"    TEXT NOT NULL,
  "userpEntidadeId" INTEGER NOT NULL,
  "nome"            TEXT NOT NULL,
  "telefone"        TEXT,
  "email"           TEXT,
  "token"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "enrolledEventId" TEXT,
  "enrolledAt"      TIMESTAMP(3),
  "createdById"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DegustacaoLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DegustacaoLink_degustacaoId_fkey"
    FOREIGN KEY ("degustacaoId") REFERENCES "Degustacao"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DegustacaoLink_enrolledEventId_fkey"
    FOREIGN KEY ("enrolledEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DegustacaoLink_token_key" ON "DegustacaoLink"("token");
-- Mesma regra de idempotência do sistema anterior: 1 link por entidade Userp por degustação.
CREATE UNIQUE INDEX IF NOT EXISTS "DegustacaoLink_degustacaoId_userpEntidadeId_key"
  ON "DegustacaoLink"("degustacaoId", "userpEntidadeId");
CREATE INDEX IF NOT EXISTS "DegustacaoLink_degustacaoId_idx" ON "DegustacaoLink"("degustacaoId");

CREATE TABLE IF NOT EXISTS "DegustacaoEnrollment" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "degustacaoId"    TEXT NOT NULL,
  "contractEventId" TEXT NOT NULL,
  "enrolledAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DegustacaoEnrollment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DegustacaoEnrollment_degustacaoId_fkey"
    FOREIGN KEY ("degustacaoId") REFERENCES "Degustacao"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DegustacaoEnrollment_contractEventId_fkey"
    FOREIGN KEY ("contractEventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DegustacaoEnrollment_degustacaoId_contractEventId_key"
  ON "DegustacaoEnrollment"("degustacaoId", "contractEventId");
CREATE INDEX IF NOT EXISTS "DegustacaoEnrollment_degustacaoId_idx" ON "DegustacaoEnrollment"("degustacaoId");
