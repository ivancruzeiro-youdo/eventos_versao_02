// Pendências de planejamento de um evento — mesmos critérios do GET /events/:id/tab-badges
// (abas A&B, Infra, Entretenimento, Mão de obra, Equipe, Plano), menos "atividades abertas", que
// já têm alerta próprio (workers/activity-alerts). Recebe o cliente do banco por parâmetro pra
// poder ser testado em transação sem subir o servidor.
//
// Além disso calcula o que falta o CLIENTE confirmar na aba Plano do portal (mesma conta do
// StatusBanner do portal): pergunta obrigatória sem resposta + resposta ainda não confirmada.
export interface EventPendencies {
  items: string[];            // rótulos legíveis, ex.: "A&B (3 itens sem escolha)"
  planUnconfirmed: number;    // perguntas do plano que o cliente ainda não confirmou
}

const hasAnswer = (a: any) => a != null && a.answer != null && a.answer !== '' && !(Array.isArray(a.answer) && a.answer.length === 0);

export async function getEventPendencies(db: any, eventId: string): Promise<EventPendencies> {
  const [abItems, infraItems, entItems, staffSlots, teamCount, planItems, venues, venueAnswers, approvals] = await Promise.all([
    db.eventItem.findMany({ where: { eventId, category: 'ab' }, select: { choices: { where: { chosen: { isEmpty: false } }, select: { id: true } }, answers: { select: { id: true } } } }),
    db.eventItem.findMany({ where: { eventId, category: 'infra' }, select: { choices: { where: { chosen: { isEmpty: false } }, select: { id: true } } } }),
    db.eventItem.findMany({ where: { eventId, category: 'entretenimento' }, select: { choices: { where: { chosen: { isEmpty: false } }, select: { id: true } }, answers: { select: { id: true } } } }),
    db.eventStaffSlot.findMany({ where: { eventItem: { eventId } }, select: { quantity: true, filledCount: true } }),
    db.eventMember.count({ where: { eventId } }),
    db.eventItem.findMany({ where: { eventId }, select: { id: true, product: { select: { questions: { select: { id: true, required: true } } } }, answers: { select: { questionId: true, answer: true } } } }),
    db.eventVenue.findMany({ where: { eventId }, select: { venueId: true, venue: { select: { questions: { select: { id: true, required: true } } } } } }),
    db.eventVenueAnswer.findMany({ where: { eventId }, select: { questionId: true, answer: true } }),
    db.clientApproval.findMany({ where: { eventId }, select: { itemId: true } }),
  ]);

  const items: string[] = [];
  const nAb = abItems.filter((i: any) => i.choices.length === 0 && i.answers.length === 0).length;
  const nInfra = infraItems.filter((i: any) => i.choices.length === 0).length;
  const nEnt = entItems.filter((i: any) => i.choices.length === 0 && i.answers.length === 0).length;
  const missingStaff = (staffSlots as any[]).reduce((n, s) => n + Math.max(0, s.quantity - s.filledCount), 0);
  if (nAb) items.push(`A&B (${nAb} ${nAb > 1 ? 'itens sem escolha' : 'item sem escolha'})`);
  if (nInfra) items.push(`Infra (${nInfra} ${nInfra > 1 ? 'itens sem escolha' : 'item sem escolha'})`);
  if (nEnt) items.push(`Entretenimento (${nEnt} ${nEnt > 1 ? 'itens sem configuração' : 'item sem configuração'})`);
  if (missingStaff) items.push(`Mão de obra (${missingStaff} ${missingStaff > 1 ? 'vagas abertas' : 'vaga aberta'})`);
  if (teamCount === 0) items.push('Equipe do evento vazia');

  // Plano: respostas internas faltando (critério do badge) e confirmação do cliente
  const approved = new Set((approvals as any[]).map((a) => a.itemId));
  let totalQ = 0, answeredQ = 0, planUnconfirmed = 0;
  for (const it of planItems as any[]) {
    for (const q of it.product?.questions ?? []) {
      totalQ++;
      const answered = hasAnswer((it.answers as any[]).find((a) => a.questionId === q.id));
      if (answered) answeredQ++;
      if ((answered || q.required) && !approved.has(`plan_q:${it.id}_${q.id}`)) planUnconfirmed++;
    }
  }
  for (const ev of venues as any[]) {
    for (const q of ev.venue?.questions ?? []) {
      totalQ++;
      const answered = hasAnswer((venueAnswers as any[]).find((a) => a.questionId === q.id));
      if (answered) answeredQ++;
      if ((answered || q.required) && !approved.has(`venue_q:${ev.venueId}_${q.id}`)) planUnconfirmed++;
    }
  }
  if (totalQ > 0 && answeredQ < totalQ) items.push(`Plano (${totalQ - answeredQ} ${totalQ - answeredQ > 1 ? 'perguntas sem resposta' : 'pergunta sem resposta'})`);
  if (planUnconfirmed) items.push(`Plano não confirmado pelo cliente (${planUnconfirmed} ${planUnconfirmed > 1 ? 'itens' : 'item'})`);

  return { items, planUnconfirmed };
}
