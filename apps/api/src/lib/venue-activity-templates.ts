import { prisma } from '../server.js';

// Replica os templates de atividade obrigatória do espaço (VenueActivityTemplate) como
// EventActivity de verdade, sempre que um evento ganha esse espaço vinculado — mesmo card,
// mesmo alerta de atraso por WhatsApp (activity-alerts.ts) que qualquer atividade manual já
// usa, sem precisar de nenhuma mudança lá.
//
// Chamado em todo lugar onde um EventVenue passa a existir: criação de evento via sync UERP,
// sync aditivo de espaços num evento já existente, e criação manual de evento.
export async function applyVenueActivityTemplates(
  eventId: string,
  venueId: string,
  checkInAt: Date | null
): Promise<void> {
  // Sem check-in não há base pra calcular o prazo — melhor não gerar nada agora (o operador
  // ainda pode preencher a data depois; não tem como recalcular retroativamente hoje) do que
  // adivinhar uma data errada.
  if (!checkInAt) return;

  const templates = await (prisma as any).venueActivityTemplate.findMany({
    where: { venueId, active: true },
  });
  if (templates.length === 0) return;

  for (const t of templates) {
    // Idempotente: nunca duplica a mesma atividade gerada duas vezes pro mesmo evento, mesmo
    // se a sincronização rodar de novo (ex.: reenvio, ou espaço processado duas vezes).
    const exists = await (prisma as any).eventActivity.findFirst({
      where: { eventId, sourceTemplateId: t.id },
      select: { id: true },
    });
    if (exists) continue;

    await (prisma as any).eventActivity.create({
      data: {
        eventId,
        title: t.title,
        description: t.description,
        assignedToId: t.defaultAssignedToId,
        dueAt: new Date(checkInAt.getTime() - t.offsetMinutesBeforeCheckIn * 60_000),
        alertFreqMinutes: t.alertFreqMinutes,
        sourceTemplateId: t.id,
      },
    });
  }
}
