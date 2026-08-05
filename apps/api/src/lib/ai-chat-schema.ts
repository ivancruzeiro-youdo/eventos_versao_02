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
- "Freelancer": name, email, cpf, status (active|suspended), "strikeCount". NÃO tem
  "eventId" — o vínculo com eventos é sempre via "FreelancerApplication".
- "FreelancerApplication": "freelancerId", "eventId", role, status (pending|approved|
  rejected|cancelled), "appliedAt". É a ÚNICA ligação entre freelancer e evento — é aqui
  que se responde "quem trabalhou em quais eventos".
- "EventService": "eventId", "serviceId", "productName", "maxSlots", code, "valuePerHour",
  "startAt", "endAt" — são as VAGAS abertas do evento (quantas pessoas de cada cargo),
  não as pessoas escaladas. Quem preenche as vagas está em "FreelancerApplication".
- "FreelancerService": catálogo de cargos (Garçom, Bartender, ...), "hourlyRate".
- "FreelancerPenalty": "freelancerId", "eventId" (opcional) — advertências/strikes.
- "EventSchedule": "eventId", "teamId", name, "startAt", "endAt" — itens de cronograma.
- "EventActivity": "eventId", title, status (open|done|...), "dueAt", "assignedToId"
  (User) ou "assignedPersonId" (Person), "completedAt".
- "EventNPS": "eventId", "guestId", score (0-10 ou null), comment, "submittedAt" —
  pesquisa de satisfação pós-evento respondida pelo convidado.
- "Employer": empresa/organização dona dos eventos (multi-tenant — "Event.employerId").
- "EventProfessional": ATENÇÃO — liga "Person", NÃO "Freelancer". São profissionais
  externos contratados (fotógrafo, músico, DJ). Nunca use essa tabela pra perguntas sobre
  freelancers, nem "Freelancer" pra perguntas sobre esses profissionais.
- "AcessoLog": tabela de integração com a catraca/controle de acesso. Hoje está VAZIA em
  produção — nunca a use pra inferir presença/comparecimento; não há dado de check-in real
  de freelancer no sistema.
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
- "Freelancer trabalhou num evento" = "FreelancerApplication" com status='approved'.
  Candidatura ('pending') não é trabalho, e 'rejected'/'cancelled' menos ainda. Se a
  pergunta for ambígua, use 'approved' e DIGA na resposta qual definição usou.
- ARMADILHA DE DATA: para filtrar "em julho" quem trabalhou, junte com "Event" e filtre
  por "Event"."startAt". NÃO filtre por "FreelancerApplication"."appliedAt" — essa é a data
  em que a pessoa se candidatou, não a data do evento, e dá resposta errada.
- Perguntas do tipo "quantos X em mais de N Y" = GROUP BY + HAVING com count(DISTINCT):
    SELECT count(*) FROM (
      SELECT fa."freelancerId"
      FROM "FreelancerApplication" fa
      JOIN "Event" e ON e.id = fa."eventId"
      WHERE e."startAt" >= '2026-07-01' AND e."startAt" < '2026-08-01'
        AND fa.status = 'approved'
      GROUP BY fa."freelancerId"
      HAVING count(DISTINCT fa."eventId") > 1
    ) t;
  Conte DISTINCT do "eventId": um freelancer pode ter mais de uma candidatura aprovada no
  MESMO evento (cargos diferentes), e sem o DISTINCT isso viraria falso positivo.
- Nunca faça SELECT * em tabelas com colunas de credencial (ex.: "Freelancer".
  "passwordHash", "VenueSpotifyConnection"."encryptedAccessToken"/"encryptedRefreshToken",
  "VenueDevice"."deviceToken", "SpotifyAppConfig"."clientSecret") — se precisar dessas
  tabelas, selecione só as colunas realmente necessárias pra responder a pergunta.
`.trim();
