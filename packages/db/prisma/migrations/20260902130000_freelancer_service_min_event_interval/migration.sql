-- Quantos eventos (com vaga deste mesmo serviço) precisam existir entre dois eventos onde o
-- mesmo freelancer trabalha nesse serviço. 0 = sem regra (padrão, comportamento atual).
ALTER TABLE "FreelancerService" ADD COLUMN IF NOT EXISTS "minEventIntervalCount" INTEGER NOT NULL DEFAULT 0;
