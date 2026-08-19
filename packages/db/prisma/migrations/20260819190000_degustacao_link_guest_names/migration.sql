-- Snapshot dos nomes de convidados inscritos por link de degustação (ver comentário no schema).
ALTER TABLE "DegustacaoLink" ADD COLUMN IF NOT EXISTS "enrolledGuestNames" TEXT[] NOT NULL DEFAULT '{}';
