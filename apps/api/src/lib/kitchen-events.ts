// Barramento de eventos da TELA COZINHA: quando um PC altera a sequência, os outros são
// avisados na hora em vez de esperar o poll de 60s.
//
// Em MEMÓRIA de propósito. A API roda em um único container (docker-compose.prod.yml não
// define réplicas), então um Map local resolve com zero infraestrutura. Se um dia houver mais
// de uma instância, cada uma só avisaria os clientes conectados a ela — aí a troca é publicar
// via Redis (que já existe no stack) mantendo esta mesma interface.
import type { FastifyReply } from 'fastify';

type Client = { id: number; reply: FastifyReply };

const subscribers = new Map<string, Set<Client>>();
let nextId = 1;

export type KitchenEventType =
  | 'plan-changed'      // sequência mudou (add, remove, reordenar, horário, servido…)
  | 'prep-changed';     // check de produzido na visão da semana

/** Envia um evento a todos os PCs olhando este evento, menos quem originou a mudança. */
export function publishKitchenEvent(eventId: string, type: KitchenEventType, originId?: string) {
  const set = subscribers.get(eventId);
  if (!set || set.size === 0) return;

  const payload = JSON.stringify({ type, at: new Date().toISOString(), originId: originId ?? null });
  for (const client of set) {
    try {
      client.reply.raw.write(`event: ${type}\ndata: ${payload}\n\n`);
    } catch {
      // Conexão já morta: o handler de close remove; aqui só não pode derrubar os outros.
    }
  }
}

export function subscribeKitchenEvents(eventId: string, reply: FastifyReply): () => void {
  const client: Client = { id: nextId++, reply };
  let set = subscribers.get(eventId);
  if (!set) { set = new Set(); subscribers.set(eventId, set); }
  set.add(client);

  return () => {
    const s = subscribers.get(eventId);
    if (!s) return;
    s.delete(client);
    if (s.size === 0) subscribers.delete(eventId);
  };
}

export function subscriberCount(eventId: string): number {
  return subscribers.get(eventId)?.size ?? 0;
}
