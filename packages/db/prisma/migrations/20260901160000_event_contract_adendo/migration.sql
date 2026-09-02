-- Adendo aos termos da simulação vinculada ao contrato (adentos_aos_termos em contratos/index.php).
ALTER TABLE "EventContract" ADD COLUMN IF NOT EXISTS "adendo" TEXT;
