// Config da OpenAI compartilhada — extraído de routes/kitchen-plan.ts (onde a chave já
// era guardada em banco, via UerpConfig, em vez de env var) pra ser reutilizável por
// qualquer feature que precise da API (kitchen-plan.ts e routes/ai-chat.ts, por ora).
import { prisma } from '../server.js';
import OpenAI from 'openai';

export async function getConfig(key: string): Promise<string | null> {
  const cfg = await (prisma as any).uerpConfig.findUnique({ where: { key } });
  return cfg?.value ?? null;
}

export async function setConfig(key: string, value: string) {
  await (prisma as any).uerpConfig.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function getOpenAI(): Promise<OpenAI | null> {
  const apiKey = await getConfig('openai_api_key');
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}
