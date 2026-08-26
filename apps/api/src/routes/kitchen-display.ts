// TELA COZINHA — endpoints do display de serviço da cozinha (tipo KDS).
//
// Duas visões: "eventos da semana" (próximos 7 dias por espaço) e "evento do dia"
// (controle de serviço, com a sequência de saídas a cada 15 min).
//
// O cardápio vem dos itens de A&B contratados e das escolhas do cliente — não do módulo de
// Receitas/Menus, que está praticamente sem uso em produção.
import type { FastifyInstance } from 'fastify';
import { prisma } from '../server.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { publishKitchenEvent, subscribeKitchenEvents } from '../lib/kitchen-events.js';

const WRITE_ROLES = ['admin', 'event_owner', 'operator'];

// ── Fuso ─────────────────────────────────────────────────────────────────────
// BRT é UTC-3 fixo (sem horário de verão desde 2019), mesma premissa do parseBrt em
// sync-events.ts. O agrupamento por dia é feito SEMPRE aqui no servidor: o relógio/fuso do
// PC da cozinha não é confiável.
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** "YYYY-MM-DD" (dia em BRT) → instante UTC em que esse dia começa. */
function brtDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T03:00:00.000Z`);
}

/** Instante → "YYYY-MM-DD" do dia BRT a que ele pertence. */
function brtDayKey(d: Date): string {
  return new Date(d.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

// ── Tenancy ──────────────────────────────────────────────────────────────────
// Mesmo padrão de schedules.ts/guests.ts: admin e sessões sem employerId (derivadas de
// freelancer) passam; o resto só acessa eventos do próprio employer.
async function checkEventAccess(user: any, eventId: string): Promise<boolean> {
  if (user.role === 'admin' || user.employerId === undefined) return true;
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { employerId: true } });
  return !!event && event.employerId === user.employerId;
}

/**
 * Checa acesso E marca o evento na request, que é o que o hook de onResponse usa pra avisar os
 * outros PCs. Ficam juntos de propósito: todo handler já precisa checar acesso, então não há
 * caminho em que se mutile o evento sem passar por aqui — e assim não dá pra esquecer o aviso.
 */
async function allowEvent(request: any, eventId: string): Promise<boolean> {
  request.kitchenEventId = eventId;
  return checkEventAccess(request.user, eventId);
}

function venueWhere(user: any) {
  return user.role === 'admin' || user.employerId === undefined ? {} : { employerId: user.employerId };
}

// ── Classificação do pacote de A&B ───────────────────────────────────────────
// Feita por NOME porque no cadastro todos os produtos de A&B compartilham a mesma
// categoryName ("Fornecimento de Alimentos e Bebidas") — não há campo que distinga.
//
// A ORDEM importa e o default é "comida" de propósito: esconder comida da cozinha é muito
// pior que mostrar uma bebida. Dois casos reais que justificam cada regra:
//   - "Prato Feito + Bebida STAFF" → é refeição da equipe. Se a regra de bebida viesse antes
//     da de comida, sumiria da tela.
//   - "Pacote de bebdias - adicional - Negroni" → typo de "bebidas" no cadastro; por isso o
//     padrão de bebida cobre a grafia errada também.
export type PackageKind = 'estacao' | 'bebida' | 'comida';

const RE_ESTACAO = /(carrinho|esta[cç][aã]o|buffet|coffee)/i;
const RE_COMIDA  = /(prato\s*feito|comida|lanche|finger|sobremesa|churrasco|pizza|petit\s*four|biscoito|massas?|refei[cç][aã]o|jantar|almo[cç]o|ceia)/i;
const RE_BEBIDA  = /(bebida|bebdia|bebidas|chopp|drink|suco|refrigerante|open\s*bar|soft|caipir|negroni|espumante|vinho|cerveja|whisky|vodka|gin)/i;

export function classifyPackage(name: string): PackageKind {
  const n = name || '';
  if (RE_ESTACAO.test(n)) return 'estacao';
  if (RE_COMIDA.test(n)) return 'comida';
  if (RE_BEBIDA.test(n)) return 'bebida';
  return 'comida';
}

/** Rótulos das 3 saídas de um pacote de estação, na ordem em que a cozinha executa. */
const ESTACAO_STEPS = [
  { kind: 'montagem', label: 'Montagem' },
  { kind: 'reposicao', label: 'Reposição' },
  { kind: 'desmontagem', label: 'Desmontagem' },
] as const;

// ── Itens escolhidos pelo cliente ────────────────────────────────────────────
// As escolhas vivem em DUAS estruturas paralelas, ambas em uso em produção:
//   a) EventItemChoice.chosen (String[]) — usado em Pacote de Bebidas, Coffee Break, Churrasco
//   b) EventItemAnswer.answer (Json, array) ligado a ProductQuestion type='multiselect' —
//      usado nos pacotes de Finger Food
// A tela precisa da UNIÃO das duas (um pacote pode legitimamente ter as duas), deduplicada
// sem diferenciar maiúsculas — daí não dar preferência a uma como faz a página de placas.
interface ChosenItem {
  itemName: string;
  sourceLabel: string | null;
  source: 'choice' | 'answer';
}

function buildChosenItems(item: any): ChosenItem[] {
  const out: ChosenItem[] = [];
  const seen = new Set<string>();

  const push = (name: unknown, sourceLabel: string | null, source: 'choice' | 'answer') => {
    if (typeof name !== 'string') return;
    const clean = name.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ itemName: clean, sourceLabel, source });
  };

  for (const choice of item.choices ?? []) {
    for (const name of choice.chosen ?? []) push(name, choice.label ?? null, 'choice');
  }

  const questionsById = new Map<string, any>();
  for (const q of item.product?.questions ?? []) questionsById.set(q.id, q);
  for (const answer of item.answers ?? []) {
    const value = answer.answer;
    if (!Array.isArray(value)) continue; // só multiselect interessa; escalar não é item de cardápio
    const label = questionsById.get(answer.questionId)?.text ?? null;
    for (const name of value) push(name, label, 'answer');
  }

  return out;
}

// ── Headcount ────────────────────────────────────────────────────────────────
// ATENÇÃO: Guest não tem campo de saída (só checkedInAt), então não existe "pessoas na casa
// agora". O melhor possível é PRESENTES ACUMULADOS até o instante `at` — número que nunca
// diminui. O front rotula exatamente assim, pra cozinha não superdimensionar no fim da noite.
async function computeHeadcount(eventId: string, at: Date) {
  const [checkedIn, totalCheckins, abAgg, confirmedGuests] = await Promise.all([
    prisma.guest.count({ where: { eventId, checkedInAt: { lte: at } } }),
    prisma.guest.count({ where: { eventId, checkedInAt: { not: null } } }),
    // Cada pacote de A&B tem quantity = nº de pessoas. Usa MAX e não SOMA: dois pacotes
    // (ex.: Finger Food + Coffee Break) atendem o MESMO público, somar dobraria a demanda.
    prisma.eventItem.aggregate({ where: { eventId, category: 'ab' }, _max: { quantity: true } }),
    prisma.guest.count({ where: { eventId, status: { in: ['confirmed', 'checked_in'] } } }),
  ]);

  const contracted = abAgg._max.quantity ?? confirmedGuests ?? 0;
  const hasCheckin = totalCheckins > 0;

  return {
    checkedIn,
    totalCheckins,
    contracted,
    effective: hasCheckin ? checkedIn : contracted,
    isEstimate: !hasCheckin,
    source: hasCheckin ? ('checkin' as const) : ('contracted' as const),
    at: at.toISOString(),
  };
}

/** Horário curto em BRT, pra descrição legível no log de auditoria. */
function fmtBrtLog(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

// ── Auditoria ────────────────────────────────────────────────────────────────
// Toda alteração da sequência registra quem fez e quando. Nunca lança: falha ao gravar o log
// não pode impedir a operação em si (a cozinha está no meio do evento).
async function logPlan(planId: string, action: string, detail: string, user: any) {
  try {
    await prisma.kitchenServicePlanLog.create({
      data: {
        planId,
        action,
        detail,
        userId: user?.id ?? null,
        userName: user?.name || user?.email || null,
      },
    });
  } catch (err) {
    console.error('[kitchen-display] falha ao gravar log do plano:', err);
  }
}

function demandFor(entry: { manualQuantity: number | null; portionsPerPerson: number }, effective: number) {
  if (entry.manualQuantity != null) {
    return { quantity: entry.manualQuantity, basis: 'manual' as const };
  }
  return {
    quantity: Math.ceil(effective * (entry.portionsPerPerson || 1)),
    basis: 'calculado' as const,
  };
}

const itemInclude = {
  choices: true,
  answers: true,
  product: { select: { id: true, name: true, questions: { select: { id: true, text: true, type: true } } } },
} as const;

export async function kitchenDisplayRoutes(app: FastifyInstance) {
  // Publica a mudança pros outros PCs automaticamente ao fim de QUALQUER mutação bem-sucedida
  // deste plugin. Feito por hook e não com uma chamada em cada endpoint porque assim não há
  // como esquecer de avisar num endpoint novo — e o custo de esquecer é a outra tela mostrar
  // dado velho sem ninguém perceber.
  app.addHook('onResponse', async (request, reply) => {
    const method = request.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
    if (reply.statusCode >= 400) return;
    const eventId = (request as any).kitchenEventId as string | undefined;
    if (!eventId) return;
    const type = request.url.includes('/prep-check') ? 'prep-changed' : 'plan-changed';
    publishKitchenEvent(eventId, type);
  });

  // ── Espaços disponíveis pra escolher na tela ───────────────────────────────
  app.get('/kitchen/display/venues', { preHandler: requireAuth }, async (request) => {
    const user = (request as any).user;
    const venues = await prisma.venue.findMany({
      where: venueWhere(user),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { success: true, venues };
  });

  // ── Modo 1: EVENTOS DA SEMANA ─────────────────────────────────────────────
  app.get('/kitchen/display/week', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { venueIds, from, days } = request.query as { venueIds?: string; from?: string; days?: string };

    const ids = (venueIds ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return reply.status(400).send({ error: 'Informe pelo menos um espaço (venueIds).' });

    const dayCount = Math.min(Math.max(parseInt(days ?? '7', 10) || 7, 1), 14);
    const startKey = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : brtDayKey(new Date());
    const rangeStart = brtDayStart(startKey);
    const rangeEnd = addDays(rangeStart, dayCount);

    const venues = await prisma.venue.findMany({
      where: { id: { in: ids }, ...venueWhere(user) },
      select: { id: true, name: true },
    });

    const links = await prisma.eventVenue.findMany({
      where: { venueId: { in: venues.map(v => v.id) } },
      select: {
        venueId: true,
        event: {
          select: {
            id: true, name: true, clientName: true, status: true,
            setupAt: true, startAt: true, teardownAt: true,
            items: { where: { category: 'ab' }, include: itemInclude },
          },
        },
      },
    });

    // Um evento pode estar em vários espaços — headcount é por evento, então calcula uma vez.
    const uniqueEventIds = [...new Set(links.map(l => l.event.id))];
    const headcounts = new Map<string, Awaited<ReturnType<typeof computeHeadcount>>>();
    await Promise.all(uniqueEventIds.map(async id => {
      headcounts.set(id, await computeHeadcount(id, new Date()));
    }));

    // Checks de "já produzido" — o pessoal da cozinha marca na visão da semana o que adiantou.
    const prepRows = await prisma.kitchenPrepCheck.findMany({
      where: { eventId: { in: uniqueEventIds } },
      select: { eventId: true, itemName: true, checkedAt: true, checkedByName: true },
    });
    const prepByEvent = new Map<string, Set<string>>();
    const prepChecksByEvent = new Map<string, typeof prepRows>();
    for (const p of prepRows) {
      if (!prepByEvent.has(p.eventId)) prepByEvent.set(p.eventId, new Set());
      prepByEvent.get(p.eventId)!.add(p.itemName.toLowerCase());
      const list = prepChecksByEvent.get(p.eventId) ?? [];
      list.push(p);
      prepChecksByEvent.set(p.eventId, list);
    }

    let undatedCount = 0;
    const byVenue = new Map<string, any[]>();
    for (const v of venues) byVenue.set(v.id, []);

    for (const link of links) {
      const ev = link.event;
      if (ev.status === 'cancelled') continue;
      // startAt e setupAt são ambos nulláveis — sem nenhuma data o evento não entra na grade.
      const ref = ev.startAt ?? ev.setupAt;
      if (!ref) { undatedCount++; continue; }
      if (ref < rangeStart || ref >= rangeEnd) continue;
      byVenue.get(link.venueId)?.push({ ...ev, _ref: ref });
    }

    const dayKeys = Array.from({ length: dayCount }, (_, i) => brtDayKey(addDays(rangeStart, i)));

    const result = venues.map(venue => {
      const events = byVenue.get(venue.id) ?? [];
      return {
        venue,
        days: dayKeys.map(date => ({
          date,
          events: events
            .filter(ev => brtDayKey(ev._ref) === date)
            .sort((a, b) => a._ref.getTime() - b._ref.getTime())
            .map(ev => ({
              id: ev.id,
              name: ev.name,
              clientName: ev.clientName,
              status: ev.status,
              startAt: ev.startAt,
              setupAt: ev.setupAt,
              teardownAt: ev.teardownAt,
              headcount: headcounts.get(ev.id),
              // Bebidas ficam fora da tela da cozinha, mas os nomes voltam em hiddenDrinks
              // pra ninguém descobrir tarde que um item sumiu por classificação errada.
              packages: ev.items
                .filter((item: any) => classifyPackage(item.name) !== 'bebida')
                .map((item: any) => ({
                  eventItemId: item.id,
                  name: item.name,
                  quantity: item.quantity,
                  unit: item.unit,
                  kind: classifyPackage(item.name),
                  serviceStartAt: item.serviceStartAt,
                  serviceEndAt: item.serviceEndAt,
                  chosenItems: buildChosenItems(item),
                  prepChecked: prepByEvent.get(ev.id)?.has(item.name.toLowerCase()) ?? false,
                })),
              hiddenDrinks: ev.items
                .filter((item: any) => classifyPackage(item.name) === 'bebida')
                .map((item: any) => item.name),
              prepChecks: (prepChecksByEvent.get(ev.id) ?? []).map(p => ({
                itemName: p.itemName, checkedAt: p.checkedAt, checkedByName: p.checkedByName,
              })),
            })),
        })),
      };
    });

    return { success: true, generatedAt: new Date().toISOString(), from: startKey, days: dayCount, venues: result, undatedCount };
  });

  // ── Seletor manual de evento de um espaço ─────────────────────────────────
  app.get('/kitchen/display/venues/:venueId/events', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { venueId } = request.params as { venueId: string };

    const venue = await prisma.venue.findFirst({ where: { id: venueId, ...venueWhere(user) }, select: { id: true } });
    if (!venue) return reply.status(404).send({ error: 'Espaço não encontrado.' });

    // Só de ontem pra frente: a cozinha não tem uso pra evento antigo, e histórico na
    // lista só aumentava a chance de escolher o evento errado. "Ontem" é o dia inteiro em
    // BRT (não 24h atrás), pra virada de madrugada não esconder o evento que acabou de sair.
    const cutoff = addDays(brtDayStart(brtDayKey(new Date())), -1);

    const links = await prisma.eventVenue.findMany({
      where: { venueId },
      select: {
        event: {
          select: { id: true, name: true, clientName: true, status: true, startAt: true, setupAt: true },
        },
      },
    });

    const events = links
      .map(l => l.event)
      .filter(ev => ev.status !== 'cancelled')
      .filter(ev => {
        const ref = ev.startAt ?? ev.setupAt;
        return !!ref && ref >= cutoff;
      })
      .sort((a, b) => {
        const ra = (a.startAt ?? a.setupAt)!.getTime();
        const rb = (b.startAt ?? b.setupAt)!.getTime();
        return ra - rb;
      });

    return { success: true, events };
  });

  // ── Modo 2: EVENTO DO DIA (controle de serviço) ───────────────────────────
  app.get('/kitchen/display/events/:eventId/service', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId } = request.params as { eventId: string };
    const { at } = request.query as { at?: string };
    if (!(await allowEvent(request, eventId))) return reply.status(403).send({ error: 'Access denied' });

    // O instante default é o do SERVIDOR — não confiamos no relógio do PC da cozinha.
    const atDate = at && !isNaN(new Date(at).getTime()) ? new Date(at) : new Date();

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true, name: true, clientName: true, status: true,
        setupAt: true, startAt: true, teardownAt: true, checkoutAt: true,
        venues: { select: { venue: { select: { id: true, name: true } } } },
      },
    });
    if (!event) return reply.status(404).send({ error: 'Evento não encontrado.' });

    const [items, comments, plan, activities, kitchenTeam] = await Promise.all([
      prisma.eventItem.findMany({ where: { eventId, category: 'ab' }, include: itemInclude, orderBy: { name: 'asc' } }),
      // Só comentários humanos: o sync grava comentários isSystem=true (inclusive o de
      // auditoria do horário de serviço), que não são observação de operação.
      prisma.eventComment.findMany({
        where: { eventId, eventItemId: { not: null }, isSystem: false, deletedAt: null },
        select: {
          id: true, content: true, createdAt: true, eventItemId: true,
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.kitchenServicePlan.findUnique({
        where: { eventId },
        include: {
          entries: { orderBy: [{ order: 'asc' }, { serveAt: 'asc' }] },
          // Últimas alterações da sequência, pra tela mostrar quem mexeu e quando.
          logs: { orderBy: { createdAt: 'desc' }, take: 30 },
        },
      }),
      prisma.eventSchedule.findMany({
        where: { eventId },
        select: {
          id: true, name: true, description: true, startAt: true, endAt: true,
          team: { select: { id: true, name: true } },
        },
        orderBy: { startAt: 'asc' },
      }),
      // Por nome e não por UUID fixo: um id chumbado quebraria em dev/staging.
      prisma.team.findFirst({ where: { name: { equals: 'Cozinha', mode: 'insensitive' } }, select: { id: true } }),
    ]);

    const headcount = await computeHeadcount(eventId, atDate);

    const commentsByItem = new Map<string, any[]>();
    for (const c of comments) {
      const list = commentsByItem.get(c.eventItemId!) ?? [];
      list.push({ id: c.id, content: c.content, createdAt: c.createdAt, user: c.user });
      commentsByItem.set(c.eventItemId!, list);
    }

    // Bebidas não entram na tela da cozinha. Os nomes voltam em hiddenDrinks pra uma
    // classificação errada ser visível em vez de sumir com um item calado.
    const kitchenItems = items.filter(i => classifyPackage(i.name) !== 'bebida');
    const hiddenDrinks = items.filter(i => classifyPackage(i.name) === 'bebida').map(i => i.name);

    const packages = kitchenItems.map(item => ({
      eventItemId: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      kind: classifyPackage(item.name),
      serviceStartAt: item.serviceStartAt,
      serviceEndAt: item.serviceEndAt,
      chosenItems: buildChosenItems(item),
      comments: commentsByItem.get(item.id) ?? [],
    }));

    // Nomes ainda válidos no cardápio, pra detectar entradas órfãs (o cliente pode trocar as
    // escolhas depois de a sequência já estar montada — e itemName é um snapshot).
    const validNames = new Set<string>();
    for (const p of packages) for (const c of p.chosenItems) validNames.add(c.itemName.toLowerCase());
    // Saídas de estação guardam o nome do PACOTE, não de um item escolhido — sem isso elas
    // apareceriam todas como órfãs.
    const validPackages = new Set(packages.map(p => p.name.toLowerCase()));

    const entries = (plan?.entries ?? []).map(e => {
      const isStation = e.entryKind !== 'item';
      const known = isStation
        ? validPackages.has(e.itemName.toLowerCase())
        : validNames.has(e.itemName.toLowerCase());
      return {
        ...e,
        demand: demandFor(e, headcount.effective),
        orphan: !known,
        packageMissing: e.eventItemId === null,
      };
    });

    return {
      success: true,
      generatedAt: new Date().toISOString(),
      event: { ...event, venues: event.venues.map(v => v.venue) },
      headcount,
      packages,
      hiddenDrinks,
      plan: plan
        ? {
            id: plan.id, intervalMinutes: plan.intervalMinutes, anchorAt: plan.anchorAt, endAt: plan.endAt,
            notes: plan.notes, updatedAt: plan.updatedAt, entries,
            // null cobre tanto "nunca pausou" quanto "pausa já expirou" — comparado contra
            // atDate (mesmo instante-base do headcount) em vez de new Date() direto, pra ficar
            // consistente com o resto da resposta. Sem cron: o fim automático é só lido aqui.
            pause: plan.pauseUntil && plan.pauseUntil.getTime() > atDate.getTime()
              ? { reason: plan.pauseReason ?? '', pausedAt: plan.pausedAt, pauseUntil: plan.pauseUntil }
              : null,
            logs: plan.logs.map(l => ({
              id: l.id, action: l.action, detail: l.detail,
              userName: l.userName, createdAt: l.createdAt,
            })),
          }
        : { id: null, intervalMinutes: 15, anchorAt: null, endAt: null, notes: null, updatedAt: null, entries: [], logs: [], pause: null },
      schedule: {
        activities: activities.map(a => ({
          ...a,
          isKitchen: !!kitchenTeam && a.team?.id === kitchenTeam.id,
        })),
        // Aqui vão TODOS os itens de A&B com horário, bebidas incluídas — é o mesmo conteúdo
        // do cronograma normal do evento, e saber que o bar abre às 20h é contexto útil pra
        // cozinha. O filtro de bebida vale pra lista de produção/sequência, não pro cronograma.
        abServiceEntries: items
          .filter(i => i.serviceStartAt)
          .map(i => ({
            eventItemId: i.id,
            name: i.name,
            kind: classifyPackage(i.name),
            startAt: i.serviceStartAt,
            endAt: i.serviceEndAt,
            virtual: true as const,
          }))
          .sort((a, b) => a.startAt!.getTime() - b.startAt!.getTime()),
      },
    };
  });

  // ── Stream de mudanças (SSE) ──────────────────────────────────────────────
  // Um PC altera a sequência e os outros atualizam na hora, em vez de esperar o poll de 60s.
  // SSE e não WebSocket: o fluxo é só servidor→cliente, o EventSource reconecta sozinho, e não
  // precisa de dependência nova nem de upgrade de protocolo atravessando o nginx.
  app.get('/kitchen/display/events/:eventId/stream', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId } = request.params as { eventId: string };
    if (!(await allowEvent(request, eventId))) return reply.status(403).send({ error: 'Access denied' });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Faz o nginx desligar o buffer PARA ESTA resposta. Sem isso os eventos ficam presos no
      // buffer do proxy e só saem em bloco — a falha clássica de SSE atrás de proxy, e que não
      // depende de a config do nginx estar correta.
      'X-Accel-Buffering': 'no',
    });

    // `retry` diz ao EventSource quanto esperar pra reconectar sozinho ao cair.
    reply.raw.write('retry: 5000\n\n');
    reply.raw.write(`event: hello\ndata: {"eventId":"${eventId}"}\n\n`);

    const unsubscribe = subscribeKitchenEvents(eventId, reply);

    // Heartbeat a cada 20s: além de detectar conexão morta, mantém dados fluindo e assim
    // impede o proxy_read_timeout do nginx (60s por padrão) de matar a conexão parada.
    const ping = setInterval(() => {
      try { reply.raw.write(': ping\n\n'); } catch { /* o close abaixo limpa */ }
    }, 20_000);

    const cleanup = () => { clearInterval(ping); unsubscribe(); };
    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);
  });

  // Alvo do poll rápido: só o headcount e a demanda recalculada.
  app.get('/kitchen/display/events/:eventId/headcount', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId } = request.params as { eventId: string };
    const { at } = request.query as { at?: string };
    if (!(await allowEvent(request, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const atDate = at && !isNaN(new Date(at).getTime()) ? new Date(at) : new Date();
    const headcount = await computeHeadcount(eventId, atDate);

    const plan = await prisma.kitchenServicePlan.findUnique({
      where: { eventId },
      select: { entries: { select: { id: true, manualQuantity: true, portionsPerPerson: true } } },
    });

    return {
      success: true,
      generatedAt: new Date().toISOString(),
      headcount,
      entries: (plan?.entries ?? []).map(e => ({ id: e.id, demand: demandFor(e, headcount.effective) })),
    };
  });

  // ── Mutações do plano de serviço ──────────────────────────────────────────

  async function ensurePlan(eventId: string, data?: { intervalMinutes?: number; anchorAt?: Date | null; endAt?: Date | null }) {
    return prisma.kitchenServicePlan.upsert({
      where: { eventId },
      create: {
        eventId,
        intervalMinutes: data?.intervalMinutes ?? 15,
        anchorAt: data?.anchorAt ?? null,
        endAt: data?.endAt ?? null,
      },
      update: {
        ...(data?.intervalMinutes != null ? { intervalMinutes: data.intervalMinutes } : {}),
        ...(data?.anchorAt !== undefined ? { anchorAt: data.anchorAt } : {}),
        ...(data?.endAt !== undefined ? { endAt: data.endAt } : {}),
      },
    });
  }

  /** Horário base da 1ª saída: âncora salva → 1º horário de serviço de A&B → início do evento. */
  async function resolveAnchor(eventId: string, explicit?: string | null): Promise<Date> {
    if (explicit && !isNaN(new Date(explicit).getTime())) return new Date(explicit);

    const plan = await prisma.kitchenServicePlan.findUnique({ where: { eventId }, select: { anchorAt: true } });
    if (plan?.anchorAt) return plan.anchorAt;

    const firstAb = await prisma.eventItem.findFirst({
      where: { eventId, category: 'ab', serviceStartAt: { not: null } },
      select: { serviceStartAt: true },
      orderBy: { serviceStartAt: 'asc' },
    });
    if (firstAb?.serviceStartAt) return firstAb.serviceStartAt;

    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { startAt: true, setupAt: true } });
    return event?.startAt ?? event?.setupAt ?? new Date();
  }

  app.post('/kitchen/display/events/:eventId/plan', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId } = request.params as { eventId: string };
    if (!(await allowEvent(request, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const { intervalMinutes, anchorAt, endAt, notes } = request.body as {
      intervalMinutes?: number; anchorAt?: string | null; endAt?: string | null; notes?: string | null;
    };
    if (intervalMinutes != null && (intervalMinutes < 1 || intervalMinutes > 240)) {
      return reply.status(400).send({ error: 'Intervalo deve estar entre 1 e 240 minutos.' });
    }

    const previous = await prisma.kitchenServicePlan.findUnique({ where: { eventId }, select: { id: true, anchorAt: true } });
    const newAnchor = anchorAt === undefined ? undefined : anchorAt ? new Date(anchorAt) : null;

    const plan = await ensurePlan(eventId, {
      intervalMinutes,
      anchorAt: newAnchor,
      endAt: endAt === undefined ? undefined : endAt ? new Date(endAt) : null,
    });
    if (notes !== undefined) {
      await prisma.kitchenServicePlan.update({ where: { id: plan.id }, data: { notes } });
    }

    // Mudou o horário de início do serviço: desloca em cascata todas as saídas já geradas pelo
    // mesmo delta, pra "arancini 19h00" virar "arancini 19h30" junto com o serviço inteiro,
    // em vez de exigir reajustar item por item.
    if (previous?.anchorAt && newAnchor && newAnchor.getTime() !== previous.anchorAt.getTime()) {
      const delta = newAnchor.getTime() - previous.anchorAt.getTime();
      const entries = await prisma.kitchenServicePlanEntry.findMany({ where: { planId: plan.id }, select: { id: true, serveAt: true } });
      if (entries.length > 0) {
        await prisma.$transaction(
          entries.map(e => prisma.kitchenServicePlanEntry.update({
            where: { id: e.id },
            data: { serveAt: new Date(e.serveAt.getTime() + delta) },
          }))
        );
        const deltaMin = Math.round(delta / 60_000);
        await logPlan(plan.id, 'shift', `Horário do serviço mudou — sequência deslocada em ${deltaMin >= 0 ? '+' : ''}${deltaMin} min`, user);
      }
    }

    const fresh = await prisma.kitchenServicePlan.findUnique({ where: { id: plan.id } });
    return { success: true, plan: fresh };
  });

  const PAUSE_MINUTES = [5, 10, 15, 20, 30] as const;

  // ── Pausa do serviço ───────────────────────────────────────────────────────
  // Reagenda a sequência inteira automaticamente: em vez de "rodar" durante a pausa, desloca
  // TODA entrada pendente pra frente uma única vez, na criação — por isso não precisa de job.
  app.post('/kitchen/display/events/:eventId/pause', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId } = request.params as { eventId: string };
    if (!(await allowEvent(request, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const { minutes, reason } = request.body as { minutes?: number; reason?: string };
    if (typeof minutes !== 'number' || !PAUSE_MINUTES.includes(minutes as any)) {
      return reply.status(400).send({ error: `Duração inválida. Use um dos valores: ${PAUSE_MINUTES.join(', ')} min.` });
    }
    const trimmedReason = (reason ?? '').trim();
    if (!trimmedReason) return reply.status(400).send({ error: 'Informe o motivo da pausa.' });

    // ensurePlan não bloqueia se o plano ainda não existir — mesma decisão já tomada por
    // addItem/addStation: pausar antes de a sequência estar montada não deve travar o operador.
    const plan = await ensurePlan(eventId);

    if (plan.pauseUntil && plan.pauseUntil.getTime() > Date.now()) {
      return reply.status(409).send({ error: 'Serviço já está em pausa.' });
    }

    const now = new Date();
    const pauseUntil = new Date(now.getTime() + minutes * 60_000);

    const pending = await prisma.kitchenServicePlanEntry.findMany({
      where: { planId: plan.id, status: 'pending' },
      select: { id: true, serveAt: true },
    });

    // Atômico de propósito: se o deslocamento das entradas for salvo mas pauseUntil não, a
    // retomada antecipada não teria como calcular o tempo não usado corretamente.
    await prisma.$transaction([
      ...pending.map(e => prisma.kitchenServicePlanEntry.update({
        where: { id: e.id },
        data: { serveAt: new Date(e.serveAt.getTime() + minutes * 60_000) },
      })),
      prisma.kitchenServicePlan.update({
        where: { id: plan.id },
        data: { pausedAt: now, pauseUntil, pauseReason: trimmedReason },
      }),
    ]);

    await logPlan(plan.id, 'pause', `Serviço pausado por ${minutes} min até ${fmtBrtLog(pauseUntil)} — motivo: ${trimmedReason}`, user);

    const fresh = await prisma.kitchenServicePlan.findUnique({ where: { id: plan.id } });
    return { success: true, plan: fresh };
  });

  app.post('/kitchen/display/events/:eventId/resume', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId } = request.params as { eventId: string };
    if (!(await allowEvent(request, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const plan = await prisma.kitchenServicePlan.findUnique({ where: { eventId }, select: { id: true, pauseUntil: true } });
    if (!plan || !plan.pauseUntil) return reply.status(409).send({ error: 'Serviço não está pausado.' });

    const now = new Date();
    const remainingMs = plan.pauseUntil.getTime() - now.getTime();

    if (remainingMs > 0) {
      // Retomada ANTECIPADA: devolve só o tempo não usado — as entradas voltam pelo tanto que
      // faltava, não pela duração cheia da pausa.
      const pending = await prisma.kitchenServicePlanEntry.findMany({
        where: { planId: plan.id, status: 'pending' },
        select: { id: true, serveAt: true },
      });
      await prisma.$transaction([
        ...pending.map(e => prisma.kitchenServicePlanEntry.update({
          where: { id: e.id },
          data: { serveAt: new Date(e.serveAt.getTime() - remainingMs) },
        })),
        prisma.kitchenServicePlan.update({
          where: { id: plan.id },
          data: { pausedAt: null, pauseUntil: null, pauseReason: null },
        }),
      ]);
      await logPlan(plan.id, 'resume', `Retomado manualmente ${Math.round(remainingMs / 60_000)} min antes do fim — sequência antecipada nesse tanto`, user);
    } else {
      // O timer já tinha esgotado (cliente demorou a apertar, ou outra aba nem chegou a
      // mostrar o botão) — o deslocamento cheio já está aplicado desde a criação da pausa,
      // nada a devolver.
      await prisma.kitchenServicePlan.update({
        where: { id: plan.id },
        data: { pausedAt: null, pauseUntil: null, pauseReason: null },
      });
      await logPlan(plan.id, 'resume', 'Pausa encerrada (tempo já havia esgotado)', user);
    }

    const fresh = await prisma.kitchenServicePlan.findUnique({ where: { id: plan.id } });
    return { success: true, plan: fresh };
  });

  app.post('/kitchen/display/events/:eventId/plan/entries', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId } = request.params as { eventId: string };
    if (!(await allowEvent(request, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const { eventItemId, sourceLabel, itemName, serveAt, portionsPerPerson } = request.body as {
      eventItemId?: string | null; sourceLabel?: string | null; itemName?: string;
      serveAt?: string; portionsPerPerson?: number;
    };
    if (!itemName?.trim()) return reply.status(400).send({ error: 'itemName é obrigatório.' });

    const plan = await ensurePlan(eventId);

    // Sem serveAt: emenda no fim da fila, um intervalo depois da última saída.
    let when: Date;
    if (serveAt && !isNaN(new Date(serveAt).getTime())) {
      when = new Date(serveAt);
    } else {
      const last = await prisma.kitchenServicePlanEntry.findFirst({
        where: { planId: plan.id },
        orderBy: { serveAt: 'desc' },
        select: { serveAt: true },
      });
      when = last
        ? new Date(last.serveAt.getTime() + plan.intervalMinutes * 60_000)
        : await resolveAnchor(eventId);
    }

    const maxOrder = await prisma.kitchenServicePlanEntry.aggregate({
      where: { planId: plan.id }, _max: { order: true },
    });

    const entry = await prisma.kitchenServicePlanEntry.create({
      data: {
        planId: plan.id,
        eventItemId: eventItemId ?? null,
        sourceLabel: sourceLabel ?? null,
        itemName: itemName.trim(),
        serveAt: when,
        order: (maxOrder._max.order ?? -1) + 1,
        portionsPerPerson: portionsPerPerson ?? 1,
      },
    });
    await logPlan(plan.id, 'add', `Adicionou "${entry.itemName}" às ${fmtBrtLog(entry.serveAt)}`, user);
    return { success: true, entry };
  });

  // Geração em lote da sequência sugerida: espaça os itens pelo intervalo a partir da âncora.
  // Pula itemName já presente pra poder ser chamado de novo sem duplicar tudo.
  app.post('/kitchen/display/events/:eventId/plan/entries/bulk', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId } = request.params as { eventId: string };
    if (!(await allowEvent(request, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const { items, stations, anchorAt, intervalMinutes } = request.body as {
      items?: { eventItemId?: string | null; sourceLabel?: string | null; itemName: string; portionsPerPerson?: number }[];
      // Pacotes de estação (carrinho, buffet, coffee break, estação de massas): em vez de uma
      // linha por item a cada 15 min, cada um gera montagem / reposição / desmontagem.
      stations?: { eventItemId?: string | null; itemName: string; startAt?: string | null; endAt?: string | null }[];
      anchorAt?: string | null; intervalMinutes?: number;
    };
    const itemList = Array.isArray(items) ? items : [];
    const stationList = Array.isArray(stations) ? stations : [];
    if (itemList.length === 0 && stationList.length === 0) {
      return reply.status(400).send({ error: 'Envie ao menos um item.' });
    }

    const anchor = await resolveAnchor(eventId, anchorAt);
    const plan = await ensurePlan(eventId, { intervalMinutes, anchorAt: anchor });

    const existing = await prisma.kitchenServicePlanEntry.findMany({
      where: { planId: plan.id }, select: { itemName: true, order: true, entryKind: true },
    });
    // Chave inclui o tipo: "Buffet 01 / montagem" não colide com "Buffet 01 / desmontagem".
    const already = new Set(existing.map(e => `${e.itemName.toLowerCase()}|${e.entryKind}`));
    let order = existing.reduce((m, e) => Math.max(m, e.order), -1) + 1;

    const step = plan.intervalMinutes * 60_000;
    const rows: any[] = [];
    let skipped = 0;

    // Itens de comida: um por saída, espaçados pelo intervalo.
    for (const i of itemList) {
      const name = i.itemName?.trim();
      if (!name) { skipped++; continue; }
      if (already.has(`${name.toLowerCase()}|item`)) { skipped++; continue; }
      rows.push({
        planId: plan.id,
        eventItemId: i.eventItemId ?? null,
        sourceLabel: i.sourceLabel ?? null,
        itemName: name,
        entryKind: 'item',
        serveAt: new Date(anchor.getTime() + order * step),
        order: order++,
        portionsPerPerson: i.portionsPerPerson ?? 1,
      });
    }

    // Estações: 3 linhas por pacote. Se o item tem horário de serviço definido em A&B, montagem
    // fica 30 min antes do início, reposição no meio e desmontagem no fim — assim a sequência
    // reflete o horário contratado em vez de um intervalo genérico.
    for (const s of stationList) {
      const name = s.itemName?.trim();
      if (!name) { skipped++; continue; }
      const start = s.startAt && !isNaN(new Date(s.startAt).getTime()) ? new Date(s.startAt) : null;
      const end = s.endAt && !isNaN(new Date(s.endAt).getTime()) ? new Date(s.endAt) : null;

      for (const step3 of ESTACAO_STEPS) {
        if (already.has(`${name.toLowerCase()}|${step3.kind}`)) { skipped++; continue; }
        let when: Date;
        if (start && end) {
          when = step3.kind === 'montagem' ? new Date(start.getTime() - 30 * 60_000)
               : step3.kind === 'reposicao' ? new Date((start.getTime() + end.getTime()) / 2)
               : end;
        } else if (start) {
          when = step3.kind === 'montagem' ? new Date(start.getTime() - 30 * 60_000)
               : step3.kind === 'reposicao' ? new Date(start.getTime() + 60 * 60_000)
               : new Date(start.getTime() + 120 * 60_000);
        } else {
          when = new Date(anchor.getTime() + order * step);
        }
        rows.push({
          planId: plan.id,
          eventItemId: s.eventItemId ?? null,
          sourceLabel: step3.label,
          itemName: name,
          entryKind: step3.kind,
          serveAt: when,
          order: order++,
          portionsPerPerson: 1,
        });
      }
    }

    if (rows.length === 0) return { success: true, created: 0, skipped };

    await prisma.kitchenServicePlanEntry.createMany({ data: rows });
    await logPlan(plan.id, 'bulk_add',
      `Gerou ${rows.length} saída(s): ${rows.map(r => r.entryKind === 'item' ? r.itemName : `${r.itemName} (${r.sourceLabel})`).join(', ')}`,
      user);

    return { success: true, created: rows.length, skipped };
  });

  // Helper de acesso por entrada (a entrada não conhece o eventId direto).
  async function entryEventId(entryId: string): Promise<string | null> {
    const entry = await prisma.kitchenServicePlanEntry.findUnique({
      where: { id: entryId },
      select: { plan: { select: { eventId: true } } },
    });
    return entry?.plan.eventId ?? null;
  }

  app.patch('/kitchen/display/plan/entries/:entryId', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const { entryId } = request.params as { entryId: string };
    const eventId = await entryEventId(entryId);
    if (!eventId) return reply.status(404).send({ error: 'Saída não encontrada.' });
    if (!(await allowEvent(request, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const { serveAt, portionsPerPerson, manualQuantity, notes, status } = request.body as {
      serveAt?: string; portionsPerPerson?: number; manualQuantity?: number | null;
      notes?: string | null; status?: string;
    };
    if (status && !['pending', 'served', 'skipped'].includes(status)) {
      return reply.status(400).send({ error: 'Status inválido.' });
    }
    if (serveAt && isNaN(new Date(serveAt).getTime())) {
      return reply.status(400).send({ error: 'Horário inválido.' });
    }

    const before = await prisma.kitchenServicePlanEntry.findUnique({ where: { id: entryId } });

    const entry = await prisma.kitchenServicePlanEntry.update({
      where: { id: entryId },
      data: {
        ...(serveAt ? { serveAt: new Date(serveAt) } : {}),
        ...(portionsPerPerson != null ? { portionsPerPerson } : {}),
        ...(manualQuantity !== undefined ? { manualQuantity } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(status ? { status, servedAt: status === 'served' ? new Date() : null, servedById: status === 'served' ? (user?.id ?? null) : null } : {}),
      },
    });

    // Descreve só o que mudou de fato, pro log ser útil de ler.
    const changes: string[] = [];
    if (serveAt && before && before.serveAt.getTime() !== entry.serveAt.getTime()) {
      changes.push(`horário ${fmtBrtLog(before.serveAt)} → ${fmtBrtLog(entry.serveAt)}`);
    }
    if (status && before?.status !== entry.status) {
      changes.push(entry.status === 'served' ? 'marcou como servido' : `status → ${entry.status}`);
    }
    if (manualQuantity !== undefined && before?.manualQuantity !== entry.manualQuantity) {
      changes.push(`quantidade manual → ${entry.manualQuantity ?? 'automática'}`);
    }
    if (portionsPerPerson != null && before?.portionsPerPerson !== entry.portionsPerPerson) {
      changes.push(`porções por pessoa → ${entry.portionsPerPerson}`);
    }
    if (changes.length > 0) {
      await logPlan(entry.planId, status ? 'served' : 'update', `"${entry.itemName}": ${changes.join('; ')}`, user);
    }

    return { success: true, entry };
  });

  // Duplicar = nova linha com o mesmo itemName e round seguinte (ex.: quiche 20h e 21h30).
  app.post('/kitchen/display/plan/entries/:entryId/duplicate', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const { entryId } = request.params as { entryId: string };
    const eventId = await entryEventId(entryId);
    if (!eventId) return reply.status(404).send({ error: 'Saída não encontrada.' });
    if (!(await allowEvent(request, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const { serveAt } = request.body as { serveAt?: string };
    const original = await prisma.kitchenServicePlanEntry.findUnique({ where: { id: entryId } });
    if (!original) return reply.status(404).send({ error: 'Saída não encontrada.' });

    const plan = await prisma.kitchenServicePlan.findUnique({ where: { id: original.planId } });
    const when = serveAt && !isNaN(new Date(serveAt).getTime())
      ? new Date(serveAt)
      : new Date(original.serveAt.getTime() + (plan?.intervalMinutes ?? 15) * 60_000 * 4);

    const [maxRound, maxOrder] = await Promise.all([
      prisma.kitchenServicePlanEntry.aggregate({
        where: { planId: original.planId, itemName: original.itemName }, _max: { round: true },
      }),
      prisma.kitchenServicePlanEntry.aggregate({ where: { planId: original.planId }, _max: { order: true } }),
    ]);

    const entry = await prisma.kitchenServicePlanEntry.create({
      data: {
        planId: original.planId,
        eventItemId: original.eventItemId,
        sourceLabel: original.sourceLabel,
        itemName: original.itemName,
        entryKind: original.entryKind,
        serveAt: when,
        order: (maxOrder._max.order ?? -1) + 1,
        round: (maxRound._max.round ?? 1) + 1,
        portionsPerPerson: original.portionsPerPerson,
        manualQuantity: original.manualQuantity,
      },
    });
    await logPlan(original.planId, 'duplicate',
      `Duplicou "${entry.itemName}" para ${fmtBrtLog(entry.serveAt)} (${entry.round}ª vez)`, user);
    return { success: true, entry };
  });

  app.patch('/kitchen/display/events/:eventId/plan/reorder', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId } = request.params as { eventId: string };
    if (!(await allowEvent(request, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const { entryIds, reflow } = request.body as { entryIds?: string[]; reflow?: boolean };
    if (!Array.isArray(entryIds) || entryIds.length === 0) {
      return reply.status(400).send({ error: 'Envie entryIds.' });
    }

    const plan = await prisma.kitchenServicePlan.findUnique({ where: { eventId }, select: { id: true, intervalMinutes: true, anchorAt: true } });
    if (!plan) return reply.status(404).send({ error: 'Plano não encontrado.' });

    // Só reordena entradas que pertencem a este plano — ids de fora são ignorados.
    const owned = await prisma.kitchenServicePlanEntry.findMany({
      where: { planId: plan.id, id: { in: entryIds } }, select: { id: true },
    });
    const ownedIds = new Set(owned.map(e => e.id));
    const ordered = entryIds.filter(id => ownedIds.has(id));

    const anchor = plan.anchorAt ?? await resolveAnchor(eventId);
    const step = plan.intervalMinutes * 60_000;

    // Nomes na ordem nova, pro log dizer o que a sequência virou.
    const named = await prisma.kitchenServicePlanEntry.findMany({
      where: { id: { in: ordered } }, select: { id: true, itemName: true },
    });
    const nameById = new Map(named.map(n => [n.id, n.itemName]));

    await prisma.$transaction(
      ordered.map((id, i) =>
        prisma.kitchenServicePlanEntry.update({
          where: { id },
          data: {
            order: i,
            ...(reflow ? { serveAt: new Date(anchor.getTime() + i * step) } : {}),
          },
        })
      )
    );

    await logPlan(plan.id, 'reorder',
      `Reordenou a sequência${reflow ? ' (recalculando horários)' : ''}: ${ordered.map(id => nameById.get(id) ?? '?').join(' → ')}`,
      user);

    return { success: true, reordered: ordered.length };
  });

  app.delete('/kitchen/display/plan/entries/:entryId', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const { entryId } = request.params as { entryId: string };
    const eventId = await entryEventId(entryId);
    if (!eventId) return reply.status(404).send({ error: 'Saída não encontrada.' });
    if (!(await allowEvent(request, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const entry = await prisma.kitchenServicePlanEntry.findUnique({ where: { id: entryId } });
    await prisma.kitchenServicePlanEntry.delete({ where: { id: entryId } });
    if (entry) {
      await logPlan(entry.planId, 'remove',
        `Removeu "${entry.itemName}"${entry.entryKind !== 'item' ? ` (${entry.sourceLabel || entry.entryKind})` : ''} que estava às ${fmtBrtLog(entry.serveAt)}`,
        user);
    }
    return { success: true };
  });

  // ── Check de "já produzido" (visão da semana) ─────────────────────────────
  // Toggle idempotente: marcar duas vezes não duplica (unique em eventId+itemName), e
  // desmarcar apaga. Quem marcou e quando ficam gravados no próprio registro.
  app.post('/kitchen/display/events/:eventId/prep-check', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId } = request.params as { eventId: string };
    if (!(await allowEvent(request, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const { itemName, eventItemId, checked } = request.body as {
      itemName?: string; eventItemId?: string | null; checked?: boolean;
    };
    if (!itemName?.trim()) return reply.status(400).send({ error: 'itemName é obrigatório.' });
    const name = itemName.trim();

    if (checked === false) {
      await prisma.kitchenPrepCheck.deleteMany({ where: { eventId, itemName: name } });
      return { success: true, checked: false };
    }

    const row = await prisma.kitchenPrepCheck.upsert({
      where: { eventId_itemName: { eventId, itemName: name } },
      create: {
        eventId,
        eventItemId: eventItemId ?? null,
        itemName: name,
        checkedById: user?.id ?? null,
        checkedByName: user?.name || user?.email || null,
      },
      update: {
        checkedAt: new Date(),
        checkedById: user?.id ?? null,
        checkedByName: user?.name || user?.email || null,
      },
    });

    return {
      success: true,
      checked: true,
      check: { itemName: row.itemName, checkedAt: row.checkedAt, checkedByName: row.checkedByName },
    };
  });
}
