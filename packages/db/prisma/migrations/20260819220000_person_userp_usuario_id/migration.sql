-- Guarda o usuario_id da Userp devolvido ao vincular a pessoa a um contrato.
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "userpUsuarioId" INTEGER;
