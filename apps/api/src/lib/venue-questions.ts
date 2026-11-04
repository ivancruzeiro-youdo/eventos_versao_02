// Perguntas padrão dos espaços — biblioteca central (VenueQuestion) + vínculo por espaço
// (VenueQuestionLink). A pergunta existe uma vez; num evento com 2+ espaços que a têm, aparece e é
// respondida uma única vez (EventVenueAnswer é por evento + pergunta).

export const normText = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase();

// Duas perguntas são "a mesma" quando texto (sem caixa/espaços extras), tipo, obrigatoriedade e
// opções são iguais — mesma regra usada na migração que centralizou as perguntas.
export function questionKey(q: { text: string; type: string; required?: boolean; options?: unknown }): string {
  return [normText(q.text), q.type, q.required ? '1' : '0', q.options == null ? '' : JSON.stringify(q.options)].join('|');
}

// Reaproveita uma pergunta idêntica da biblioteca ou cria; devolve a pergunta.
export async function findOrCreateQuestion(db: any, data: { text: string; type: string; required?: boolean; options?: unknown }) {
  const all = await db.venueQuestion.findMany();
  const key = questionKey(data);
  const dup = all.find((q: any) => questionKey(q) === key);
  if (dup) return { question: dup, created: false };
  const question = await db.venueQuestion.create({
    data: { text: data.text.trim(), type: data.type, required: data.required ?? false, options: (data.options as any) ?? null, order: 0 },
  });
  return { question, created: true };
}

export async function linkQuestion(db: any, venueId: string, questionId: string): Promise<boolean> {
  const exists = await db.venueQuestionLink.findUnique({ where: { venueId_questionId: { venueId, questionId } } });
  if (exists) return false;
  const count = await db.venueQuestionLink.count({ where: { venueId } });
  await db.venueQuestionLink.create({ data: { venueId, questionId, order: count } });
  return true;
}

// Espaços do evento, cada um com `venue.questions` = perguntas vinculadas a ele que ainda NÃO
// apareceram num espaço anterior do mesmo evento — assim uma pergunta compartilhada por 2 espaços
// sai uma vez só (no primeiro espaço que a tem). Demais campos do venue vêm completos.
export async function eventVenuesWithQuestions(db: any, eventId: string) {
  const eventVenues = await db.eventVenue.findMany({
    where: { eventId },
    include: {
      venue: { include: { questionLinks: { orderBy: { order: 'asc' }, include: { question: true } } } },
    },
    orderBy: { id: 'asc' },
  });
  const seen = new Set<string>();
  return eventVenues.map((ev: any) => {
    const { questionLinks, ...venue } = ev.venue ?? { questionLinks: [] };
    const questions = (questionLinks ?? [])
      .map((l: any) => l.question)
      .filter((q: any) => {
        if (seen.has(q.id)) return false;
        seen.add(q.id);
        return true;
      });
    return { ...ev, venue: ev.venue ? { ...venue, questions } : ev.venue };
  });
}

// Chave da aprovação do cliente para uma pergunta de espaço (uma por evento + pergunta).
export const venueQuestionApprovalId = (questionId: string) => questionId;
