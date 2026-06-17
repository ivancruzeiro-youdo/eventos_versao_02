-- Add encerrado to EventStatus enum
ALTER TYPE "EventStatus" ADD VALUE 'encerrado';

-- EventClosure table
CREATE TABLE "EventClosure" (
  "id"                  TEXT NOT NULL,
  "eventId"             TEXT NOT NULL,
  "itensQuebrados"      TEXT,
  "situacoesReportadas" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventClosure_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventClosure_eventId_key" ON "EventClosure"("eventId");
CREATE INDEX "EventClosure_eventId_idx" ON "EventClosure"("eventId");

ALTER TABLE "EventClosure"
  ADD CONSTRAINT "EventClosure_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ClosureAttachment table
CREATE TABLE "ClosureAttachment" (
  "id"         TEXT NOT NULL,
  "closureId"  TEXT NOT NULL,
  "filename"   TEXT NOT NULL,
  "mimeType"   TEXT NOT NULL,
  "sizeBytes"  INTEGER NOT NULL,
  "dataBase64" TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClosureAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClosureAttachment_closureId_idx" ON "ClosureAttachment"("closureId");

ALTER TABLE "ClosureAttachment"
  ADD CONSTRAINT "ClosureAttachment_closureId_fkey"
  FOREIGN KEY ("closureId") REFERENCES "EventClosure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EventNPSOrganizador table
CREATE TABLE "EventNPSOrganizador" (
  "id"              TEXT NOT NULL,
  "closureId"       TEXT NOT NULL,
  "eventId"         TEXT NOT NULL,
  "token"           TEXT NOT NULL,
  "score"           INTEGER,
  "comentario"      TEXT,
  "imagemBase64"    TEXT,
  "respondenteName" TEXT,
  "submittedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventNPSOrganizador_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventNPSOrganizador_closureId_key" ON "EventNPSOrganizador"("closureId");
CREATE UNIQUE INDEX "EventNPSOrganizador_eventId_key"   ON "EventNPSOrganizador"("eventId");
CREATE UNIQUE INDEX "EventNPSOrganizador_token_key"     ON "EventNPSOrganizador"("token");
CREATE INDEX        "EventNPSOrganizador_eventId_idx"   ON "EventNPSOrganizador"("eventId");
CREATE INDEX        "EventNPSOrganizador_token_idx"     ON "EventNPSOrganizador"("token");

ALTER TABLE "EventNPSOrganizador"
  ADD CONSTRAINT "EventNPSOrganizador_closureId_fkey"
  FOREIGN KEY ("closureId") REFERENCES "EventClosure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventNPSOrganizador"
  ADD CONSTRAINT "EventNPSOrganizador_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
