import { normalizePhone, sendWhatsAppAlert } from './notifications.js';

// Limite de check-in por A&B contratado. Recebe o cliente do banco por parâmetro (prisma ou uma
// transação) pra poder rodar dentro da transação do check-in e ser testado sem subir o servidor.
//
//  - contratado: maior quantidade entre os itens de A&B medidos em "Pessoa" (mesma regra do
//    encerramento, closure.ts — itens em Unidade/Litro não escalam com o número de convidados);
//  - tolerância: 10% do contratado, arredondado pra cima;
//  - liberações: pessoas extras autorizadas por gestores (EventCheckinRelease), somadas ao limite.
// Check-in conta como no encerramento: convidados com status checked_in (a saída não desfaz).
export const CHECKIN_TOLERANCE = 0.1;
export const MANAGER_ROLES = ['Gestão de evento', 'Responsavel de salão'];

export type CheckinLimitLevel = 'ok' | 'warning' | 'blocked';

export interface CheckinLimitStatus {
  enabled: boolean;            // false = evento sem A&B por pessoa (ou degustação): sem limite
  contracted: number | null;
  tolerance: number;           // pessoas dos 10% adicionais
  baseLimit: number | null;    // contratado + tolerância
  released: number;            // soma das liberações
  limit: number | null;        // baseLimit + released
  checkedIn: number;
  level: CheckinLimitLevel;    // ok | warning (já nos 10% adicionais) | blocked (limite atingido)
  remaining: number | null;    // quantos check-ins ainda cabem antes de travar
}

export async function getCheckinLimitStatus(db: any, eventId: string): Promise<CheckinLimitStatus> {
  const disabled: CheckinLimitStatus = {
    enabled: false, contracted: null, tolerance: 0, baseLimit: null, released: 0, limit: null,
    checkedIn: 0, level: 'ok', remaining: null,
  };

  const [degustacao, abItems] = await Promise.all([
    db.degustacao.findUnique({ where: { eventId }, select: { id: true } }),
    db.eventItem.findMany({ where: { eventId, category: 'ab', unit: 'Pessoa' }, select: { quantity: true } }),
  ]);
  if (degustacao || abItems.length === 0) return disabled;

  const contracted = Math.max(...abItems.map((i: any) => Number(i.quantity)));
  if (!(contracted > 0)) return disabled;

  const [checkedIn, releases] = await Promise.all([
    db.guest.count({ where: { eventId, status: 'checked_in' } }),
    db.eventCheckinRelease.aggregate({ where: { eventId }, _sum: { extraGuests: true } }),
  ]);
  const tolerance = Math.ceil(contracted * CHECKIN_TOLERANCE);
  const released = releases._sum.extraGuests ?? 0;
  const baseLimit = contracted + tolerance;
  const limit = baseLimit + released;
  const level: CheckinLimitLevel = checkedIn >= limit ? 'blocked' : checkedIn >= contracted ? 'warning' : 'ok';

  return {
    enabled: true, contracted, tolerance, baseLimit, released, limit, checkedIn, level,
    remaining: Math.max(0, limit - checkedIn),
  };
}

// Aviso ao atingir o contratado: WhatsApp (Avisos Oficial) pra quem está aprovado como Gestão de
// evento e Responsável de salão neste evento + comentário no histórico. Só uma vez por evento
// (reserva a marca antes de enviar, então check-ins simultâneos não duplicam). Nunca lança —
// falha de envio não pode impedir um check-in.
export async function notifyContractedReached(db: any, eventId: string, status: CheckinLimitStatus): Promise<void> {
  try {
    await db.eventCheckinLimit.upsert({ where: { eventId }, create: { eventId }, update: {} });
    const claimed = await db.eventCheckinLimit.updateMany({ where: { eventId, warningSentAt: null }, data: { warningSentAt: new Date() } });
    if (claimed.count === 0) return;

    const event = await db.event.findUnique({ where: { id: eventId }, select: { name: true } });
    const apps = await db.freelancerApplication.findMany({
      where: { eventId, status: 'approved', role: { in: MANAGER_ROLES } },
      select: { role: true, freelancer: { select: { name: true, phone: true } } },
    });

    const link = `https://eventos.youdobrasil.com.br/events/${eventId}`;
    const sent: string[] = [];
    const failed: string[] = [];
    const noPhone: string[] = [];
    const seen = new Set<string>();
    for (const a of apps) {
      const phone = a.freelancer?.phone ? normalizePhone(a.freelancer.phone) : null;
      if (!phone) { noPhone.push(a.freelancer?.name ?? '—'); continue; }
      if (seen.has(phone)) continue; // mesma pessoa nos dois papéis recebe uma mensagem só
      seen.add(phone);
      const ok = await sendWhatsAppAlert(phone, {
        titulo: `⚠️ A&B contratado atingido: ${event?.name ?? 'evento'}`,
        detalhe: `Olá ${a.freelancer.name}! Já são ${status.checkedIn} check-ins para ${status.contracted} pessoas contratadas de A&B. A partir de agora entram os 10% adicionais, até ${status.baseLimit} pessoas — depois disso o check-in trava até um gestor liberar mais.`,
        acao: `Acompanhe e libere pela tela do evento: ${link}`,
      });
      (ok ? sent : failed).push(a.freelancer.name);
    }

    const parts = [`A&B contratado atingido: ${status.checkedIn} check-ins para ${status.contracted} contratados. Check-ins dentro dos 10% adicionais até ${status.baseLimit}; depois trava até liberação.`];
    parts.push(sent.length ? `Aviso por WhatsApp para: ${sent.join(', ')}` : 'Ninguém recebeu o aviso por WhatsApp');
    if (failed.length) parts.push(`falha no envio: ${failed.join(', ')}`);
    if (noPhone.length) parts.push(`sem telefone cadastrado: ${noPhone.join(', ')}`);
    if (apps.length === 0) parts.push('nenhum Gestão de evento / Responsável de salão aprovado neste evento');
    await db.eventComment.create({ data: { eventId, userId: null, isSystem: true, content: parts.join(' · ') } });
  } catch (err: any) {
    console.error(`[checkin-limit] falha ao avisar contratado atingido (evento ${eventId}):`, err.message);
  }
}
