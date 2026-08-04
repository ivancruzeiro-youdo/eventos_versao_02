CREATE TABLE IF NOT EXISTS "AiChatThread" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"    TEXT NOT NULL,
  "title"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiChatThread_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiChatThread_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AiChatThread_userId_idx" ON "AiChatThread"("userId");

CREATE TABLE IF NOT EXISTS "AiChatMessage" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "threadId"  TEXT NOT NULL,
  "role"      TEXT NOT NULL,
  "content"   TEXT NOT NULL,
  "toolTrace" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiChatMessage_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "AiChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AiChatMessage_threadId_idx" ON "AiChatMessage"("threadId");

CREATE TABLE IF NOT EXISTS "AiKnowledge" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "fact"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiKnowledge_pkey" PRIMARY KEY ("id")
);

-- Role só-leitura pra rodar o SQL gerado pela IA (routes/ai-chat.ts,
-- lib/ai-readonly-db.ts) — mesmo que a validação em código falhe, essa role
-- fisicamente não tem permissão de escrever nada. A senha abaixo é só um
-- placeholder: em produção, troque com
--   ALTER ROLE ai_readonly WITH PASSWORD '<senha gerada de verdade>';
-- e configure AI_READONLY_DATABASE_URL com essa senha (ver docker/.env.production).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ai_readonly') THEN
    CREATE ROLE ai_readonly LOGIN PASSWORD 'changeme-in-production';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE youdo_v2 TO ai_readonly;
GRANT USAGE ON SCHEMA public TO ai_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ai_readonly;
