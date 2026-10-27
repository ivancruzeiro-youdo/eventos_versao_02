// Vagas automáticas de Louça (equipe de cozinha), criadas junto com as demais vagas de mão de
// obra no sync do UERP. Regra:
//  - pessoas de A&B = maior quantidade entre os itens de A&B medidos em "Pessoa" (mesma conta do
//    limite de check-in e do encerramento);
//  - faixa pelo TOTAL do dia (soma dos eventos do mesmo dia em São Paulo): até 50 pessoas = 1,
//    acima de 50 = 2, acima de 150 = 3. Primeiro evento do dia → setup básico; se já existem
//    outros eventos (e vagas de Louça) no dia, só cria o que falta pra chegar na faixa do total;
//  - turno de 8h terminando no fim do evento (ex.: fim 23/10 02h → 22/10 18h até 23/10 02h).
// Nunca reduz nem apaga vaga existente — o operador pode ter ajustado à mão.
export const LOUCA_SERVICE_NAME = 'Louça';
export const LOUCA_SHIFT_HOURS = 8;
const TZ = 'America/Sao_Paulo';

export function loucaNeeded(people: number): number {
  if (!(people > 0)) return 0;
  if (people > 150) return 3;
  if (people > 50) return 2;
  return 1;
}

const spDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

async function abPeople(db: any, eventId: string): Promise<number> {
  const items = await db.eventItem.findMany({ where: { eventId, category: 'ab', unit: 'Pessoa' }, select: { quantity: true } });
  return items.length ? Math.max(...items.map((i: any) => Number(i.quantity)), 0) : 0;
}

export interface KitchenStaffResult {
  action: 'created' | 'increased' | 'none' | 'skipped';
  reason?: string;
  needed?: number;
  existing?: number;
  added?: number;
}

export async function ensureKitchenStaff(db: any, eventId: string): Promise<KitchenStaffResult> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, status: true, startAt: true, teardownAt: true, degustacao: { select: { id: true } } },
  });
  if (!event || !event.startAt) return { action: 'skipped', reason: 'evento sem data' };
  if (event.degustacao || ['cancelled', 'encerrado'].includes(event.status)) return { action: 'skipped', reason: 'degustação/cancelado/encerrado' };

  const louca = await db.freelancerService.findFirst({ where: { name: LOUCA_SERVICE_NAME } });
  if (!louca) return { action: 'skipped', reason: `cargo "${LOUCA_SERVICE_NAME}" não encontrado` };

  const thisPeople = await abPeople(db, eventId);
  if (thisPeople <= 0) return { action: 'skipped', reason: 'sem A&B por pessoa' };

  // Eventos do mesmo dia (fuso de SP). Janela larga no banco, filtro exato pela data local.
  const day = spDate(new Date(event.startAt));
  const around = await db.event.findMany({
    where: {
      status: { notIn: ['cancelled', 'encerrado'] },
      degustacao: { is: null },
      startAt: { gte: new Date(new Date(event.startAt).getTime() - 36 * 3600_000), lte: new Date(new Date(event.startAt).getTime() + 36 * 3600_000) },
    },
    select: { id: true, startAt: true },
  });
  const sameDay = around.filter((e: any) => e.startAt && spDate(new Date(e.startAt)) === day);
  if (!sameDay.some((e: any) => e.id === eventId)) sameDay.push({ id: eventId, startAt: event.startAt });

  let totalPeople = 0;
  for (const e of sameDay) totalPeople += e.id === eventId ? thisPeople : await abPeople(db, e.id);
  const needed = loucaNeeded(totalPeople);

  const existingRows = await db.eventService.findMany({
    where: { serviceId: louca.id, status: 'active', eventId: { in: sameDay.map((e: any) => e.id) } },
    select: { id: true, eventId: true, maxSlots: true },
  });
  const existing = existingRows.reduce((n: number, r: any) => n + r.maxSlots, 0);
  const missing = needed - existing;
  if (missing <= 0) return { action: 'none', needed, existing };

  const end = new Date(event.teardownAt ?? event.startAt);
  const start = new Date(end.getTime() - LOUCA_SHIFT_HOURS * 3600_000);
  const mine = existingRows.find((r: any) => r.eventId === eventId);
  if (mine) {
    await db.eventService.update({ where: { id: mine.id }, data: { maxSlots: mine.maxSlots + missing } });
  } else {
    await db.eventService.create({
      data: {
        eventId, serviceId: louca.id, productName: 'Louça (automática)', maxSlots: missing,
        valuePerHour: louca.hourlyRate ?? 0, startAt: start, endAt: end, status: 'active',
      },
    });
  }
  await db.eventComment.create({
    data: {
      eventId, userId: null, isSystem: true,
      content: `Mão de obra automática — Louça: ${missing} vaga(s) ${mine ? 'adicionada(s)' : 'criada(s)'} (${totalPeople} pessoas de A&B no dia${sameDay.length > 1 ? `, ${sameDay.length} eventos` : ''} → ${needed} no total, ${existing} já existiam). Turno de ${LOUCA_SHIFT_HOURS}h terminando no fim do evento.`,
    },
  });
  return { action: mine ? 'increased' : 'created', needed, existing, added: missing };
}
