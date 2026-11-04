import { eventVenuesWithQuestions } from './venue-questions.js';

// Roteiro da reunião de alinhamento do plano: as perguntas do plano do evento na ordem em que a
// reunião as percorre — primeiro as perguntas dos espaços (cada pergunta uma vez, mesmo vinculada
// a 2+ espaços), depois as dos itens contratados por categoria (A&B, Infra, Entretenimento, outros).
// Não guarda nada: é montado a cada chamada a partir do plano atual, então reflete o que já foi
// respondido e mudanças de contrato.
const CATEGORY_ORDER = ['ab', 'infra', 'entretenimento'];
const CATEGORY_LABEL: Record<string, string> = { ab: 'A&B', infra: 'Infraestrutura', entretenimento: 'Entretenimento' };

export interface AlignmentStep {
  id: string;
  kind: 'venue' | 'item';
  section: string;            // Espaços | A&B | Infraestrutura | Entretenimento | Outros itens
  context: string;            // nome do espaço ou do item (+ quantidade)
  itemId?: string;            // só para kind 'item'
  question: { id: string; text: string; type: string; required: boolean; options: string[] | null };
  answer: any;                // resposta atual (null se não respondida)
  answered: boolean;
}

const hasAnswer = (a: any) => a != null && a !== '' && !(Array.isArray(a) && a.length === 0);

export async function buildAlignmentScript(db: any, eventId: string) {
  const [eventVenues, items, venueAnswers] = await Promise.all([
    eventVenuesWithQuestions(db, eventId),
    db.eventItem.findMany({
      where: { eventId },
      include: { product: { include: { questions: { orderBy: { order: 'asc' } } } }, answers: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.eventVenueAnswer.findMany({ where: { eventId }, select: { questionId: true, answer: true } }),
  ]);

  const steps: AlignmentStep[] = [];
  const opts = (q: any) => (Array.isArray(q.options) ? q.options : null);

  for (const ev of eventVenues) {
    for (const q of ev.venue?.questions ?? []) {
      const answer = venueAnswers.find((a: any) => a.questionId === q.id)?.answer ?? null;
      steps.push({
        id: `venue:${q.id}`, kind: 'venue', section: 'Espaços', context: ev.venue.name,
        question: { id: q.id, text: q.text, type: q.type, required: !!q.required, options: opts(q) },
        answer, answered: hasAnswer(answer),
      });
    }
  }

  const rank = (c: string) => { const i = CATEGORY_ORDER.indexOf(c); return i === -1 ? CATEGORY_ORDER.length : i; };
  const ordered = items.filter((i: any) => i.category !== 'venue' && (i.product?.questions?.length ?? 0) > 0)
    .sort((a: any, b: any) => rank(a.category) - rank(b.category));
  for (const it of ordered) {
    const section = CATEGORY_LABEL[it.category] ?? 'Outros itens';
    const qty = it.quantity != null ? ` — ${it.quantity}${it.unit ? ' ' + it.unit : ''}` : '';
    for (const q of it.product.questions) {
      const answer = it.answers.find((a: any) => a.questionId === q.id)?.answer ?? null;
      steps.push({
        id: `item:${it.id}:${q.id}`, kind: 'item', section, context: `${it.name}${qty}`, itemId: it.id,
        question: { id: q.id, text: q.text, type: q.type, required: !!q.required, options: opts(q) },
        answer, answered: hasAnswer(answer),
      });
    }
  }
  return steps;
}

// O que está contratado, para o painel lateral da reunião (A&B, Infra, Espaços, Entretenimento).
export async function buildAlignmentContext(db: any, eventId: string) {
  const [items, eventVenues] = await Promise.all([
    db.eventItem.findMany({ where: { eventId }, select: { id: true, name: true, category: true, quantity: true, unit: true, notes: true }, orderBy: { name: 'asc' } }),
    eventVenuesWithQuestions(db, eventId),
  ]);
  const pick = (cat: string) => items.filter((i: any) => i.category === cat).map((i: any) => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit, notes: i.notes }));
  return {
    ab: pick('ab'),
    infra: pick('infra'),
    entretenimento: pick('entretenimento'),
    espacos: eventVenues.map((ev: any) => ({ id: ev.venueId, name: ev.venue?.name ?? '', capacity: ev.venue?.capacity ?? null })),
  };
}

export function summarizeScript(steps: AlignmentStep[]) {
  return {
    total: steps.length,
    answered: steps.filter(s => s.answered).length,
    pending: steps.filter(s => !s.answered).length,
    requiredPending: steps.filter(s => !s.answered && s.question.required).length,
  };
}
