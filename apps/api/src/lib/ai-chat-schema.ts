// Texto curado (não gerado automaticamente) descrevendo as tabelas mais relevantes pra
// perguntas de gestão de eventos, incluído no prompt de sistema de routes/ai-chat.ts.
// Nomes de tabela em Postgres são exatamente os nomes de model do schema.prisma (entre
// aspas duplas, case-sensitive — ex.: "EventClosure", não eventclosure).
//
// Ponto de partida deliberadamente pequeno: cresce à mão aqui com o tempo, e também
// dinamicamente via AiKnowledge (fatos que a própria IA aprende durante as conversas —
// ver a ferramenta remember_fact em routes/ai-chat.ts).
export const SCHEMA_PRIMER = `
## Tabelas principais (Postgres, nomes exatos entre aspas duplas)

- "Event": id, name, "clientName", "employerId", status (draft|confirmed|in_progress|
  completed|encerrado|cancelled), "setupAt", "startAt", "teardownAt", "checkoutAt",
  "reservationNumber", "createdAt". Um evento SEM linha em "EventClosure" ainda não foi
  encerrado/fechado.
- "EventClosure": "eventId" (único — 1 por evento), "abContractedQty" (qtd. de A&B
  contratada), "abCheckedInCount" (convidados com check-in), "abExcessQty" (excedente
  confirmado pra cobrança adicional). A EXISTÊNCIA dessa linha é o que define "evento
  fechado/encerrado" — junte com LEFT JOIN "Event" e filtre "EventClosure".id IS NULL
  pra achar eventos que ainda faltam fechar.
- "EventItem": "eventId", "productId", category ("ab" = alimentos e bebidas, "infra",
  "staff", "venue"), name, quantity, unit. Os itens de A&B contratados de um evento são
  os com category='ab'.
- "Guest": "eventId", name, status (pending|confirmed|checked_in|...), "checkedInAt",
  "isMinor". Convidados com check-in = status='checked_in' (ou "checkedInAt" IS NOT NULL).
- "Freelancer": name, email, cpf, status (active|suspended), "strikeCount".
- "EventSchedule": "eventId", "teamId", name, "startAt", "endAt" — itens de cronograma.
- "EventActivity": "eventId", title, status (open|done|...), "dueAt", "assignedToId"
  (User) ou "assignedPersonId" (Person), "completedAt".
- "EventNPS": "eventId", "guestId", score (0-10 ou null), comment, "submittedAt" —
  pesquisa de satisfação pós-evento respondida pelo convidado.
- "Employer": empresa/organização dona dos eventos (multi-tenant — "Event.employerId").
- "Venue"/"EventVenue": espaço físico e o vínculo evento↔espaço (N:N).
- "KitchenEventPlan"/"KitchenProductionPlan": planejamento de produção de cozinha por
  evento.

## Regras de negócio importantes

- "Fechar/encerrar um evento" = criar uma linha em "EventClosure" pra esse "eventId".
  Pra saber quantos eventos AINDA faltam fechar num período, filtre por "Event"."startAt"
  (ou "teardownAt") dentro do período E "EventClosure" inexistente (LEFT JOIN ... WHERE
  "EventClosure".id IS NULL), e tipicamente também "Event".status != 'cancelled'.
- Datas em Postgres: use "startAt" >= '2026-08-01' AND "startAt" < '2026-09-01' pra
  filtrar por mês, em vez de EXTRACT/DATE_TRUNC quando possível (mais simples de ler).
- Nunca faça SELECT * em tabelas com colunas de credencial (ex.: "Freelancer".
  "passwordHash", "VenueSpotifyConnection"."encryptedAccessToken"/"encryptedRefreshToken",
  "VenueDevice"."deviceToken", "SpotifyAppConfig"."clientSecret") — se precisar dessas
  tabelas, selecione só as colunas realmente necessárias pra responder a pergunta.
`.trim();
