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

function venueWhere(user: any) {
  return user.role === 'admin' || user.employerId === undefined ? {} : { employerId: user.employerId };
}

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
              packages: ev.items.map((item: any) => ({
                eventItemId: item.id,
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                serviceStartAt: item.serviceStartAt,
                serviceEndAt: item.serviceEndAt,
                chosenItems: buildChosenItems(item),
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
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

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
        include: { entries: { orderBy: [{ order: 'asc' }, { serveAt: 'asc' }] } },
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

    const packages = items.map(item => ({
      eventItemId: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      serviceStartAt: item.serviceStartAt,
      serviceEndAt: item.serviceEndAt,
      chosenItems: buildChosenItems(item),
      comments: commentsByItem.get(item.id) ?? [],
    }));

    // Nomes ainda válidos no cardápio, pra detectar entradas órfãs (o cliente pode trocar as
    // escolhas depois de a sequência já estar montada — e itemName é um snapshot).
    const validNames = new Set<string>();
    for (const p of packages) for (const c of p.chosenItems) validNames.add(c.itemName.toLowerCase());

    const entries = (plan?.entries ?? []).map(e => ({
      ...e,
      demand: demandFor(e, headcount.effective),
      orphan: !validNames.has(e.itemName.toLowerCase()),
      packageMissing: e.eventItemId === null,
    }));

    return {
      success: true,
      generatedAt: new Date().toISOString(),
      event: { ...event, venues: event.venues.map(v => v.venue) },
      headcount,
      packages,
      plan: plan
        ? { id: plan.id, intervalMinutes: plan.intervalMinutes, anchorAt: plan.anchorAt, notes: plan.notes, updatedAt: plan.updatedAt, entries }
        : { id: null, intervalMinutes: 15, anchorAt: null, notes: null, updatedAt: null, entries: [] },
      schedule: {
        activities: activities.map(a => ({
          ...a,
          isKitchen: !!kitchenTeam && a.team?.id === kitchenTeam.id,
        })),
        abServiceEntries: items
          .filter(i => i.serviceStartAt)
          .map(i => ({ eventItemId: i.id, name: i.name, startAt: i.serviceStartAt, endAt: i.serviceEndAt, virtual: true as const }))
          .sort((a, b) => a.startAt!.getTime() - b.startAt!.getTime()),
      },
    };
  });

  // Alvo do poll rápido: só o headcount e a demanda recalculada.
  app.get('/kitchen/display/events/:eventId/headcount', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId } = request.params as { eventId: string };
    const { at } = request.query as { at?: string };
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

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

  async function ensurePlan(eventId: string, data?: { intervalMinutes?: number; anchorAt?: Date | null }) {
    return prisma.kitchenServicePlan.upsert({
      where: { eventId },
      create: {
        eventId,
        intervalMinutes: data?.intervalMinutes ?? 15,
        anchorAt: data?.anchorAt ?? null,
      },
      update: {
        ...(data?.intervalMinutes != null ? { intervalMinutes: data.intervalMinutes } : {}),
        ...(data?.anchorAt !== undefined ? { anchorAt: data.anchorAt } : {}),
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
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const { intervalMinutes, anchorAt, notes } = request.body as { intervalMinutes?: number; anchorAt?: string | null; notes?: string | null };
    if (intervalMinutes != null && (intervalMinutes < 1 || intervalMinutes > 240)) {
      return reply.status(400).send({ error: 'Intervalo deve estar entre 1 e 240 minutos.' });
    }

    const plan = await ensurePlan(eventId, {
      intervalMinutes,
      anchorAt: anchorAt === undefined ? undefined : anchorAt ? new Date(anchorAt) : null,
    });
    if (notes !== undefined) {
      await prisma.kitchenServicePlan.update({ where: { id: plan.id }, data: { notes } });
    }
    return { success: true, plan };
  });

  app.post('/kitchen/display/events/:eventId/plan/entries', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId } = request.params as { eventId: string };
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

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
    return { success: true, entry };
  });

  // Geração em lote da sequência sugerida: espaça os itens pelo intervalo a partir da âncora.
  // Pula itemName já presente pra poder ser chamado de novo sem duplicar tudo.
  app.post('/kitchen/display/events/:eventId/plan/entries/bulk', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId } = request.params as { eventId: string };
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const { items, anchorAt, intervalMinutes } = request.body as {
      items?: { eventItemId?: string | null; sourceLabel?: string | null; itemName: string; portionsPerPerson?: number }[];
      anchorAt?: string | null; intervalMinutes?: number;
    };
    if (!Array.isArray(items) || items.length === 0) {
      return reply.status(400).send({ error: 'Envie ao menos um item.' });
    }

    const anchor = await resolveAnchor(eventId, anchorAt);
    const plan = await ensurePlan(eventId, { intervalMinutes, anchorAt: anchor });

    const existing = await prisma.kitchenServicePlanEntry.findMany({
      where: { planId: plan.id }, select: { itemName: true, order: true },
    });
    const already = new Set(existing.map(e => e.itemName.toLowerCase()));
    const startOrder = existing.reduce((m, e) => Math.max(m, e.order), -1) + 1;

    const fresh = items.filter(i => i.itemName?.trim() && !already.has(i.itemName.trim().toLowerCase()));
    if (fresh.length === 0) return { success: true, created: 0, skipped: items.length };

    const step = plan.intervalMinutes * 60_000;
    await prisma.kitchenServicePlanEntry.createMany({
      data: fresh.map((i, idx) => ({
        planId: plan.id,
        eventItemId: i.eventItemId ?? null,
        sourceLabel: i.sourceLabel ?? null,
        itemName: i.itemName.trim(),
        serveAt: new Date(anchor.getTime() + (startOrder + idx) * step),
        order: startOrder + idx,
        portionsPerPerson: i.portionsPerPerson ?? 1,
      })),
    });

    return { success: true, created: fresh.length, skipped: items.length - fresh.length };
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
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

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
    return { success: true, entry };
  });

  // Duplicar = nova linha com o mesmo itemName e round seguinte (ex.: quiche 20h e 21h30).
  app.post('/kitchen/display/plan/entries/:entryId/duplicate', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const { entryId } = request.params as { entryId: string };
    const eventId = await entryEventId(entryId);
    if (!eventId) return reply.status(404).send({ error: 'Saída não encontrada.' });
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

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
        serveAt: when,
        order: (maxOrder._max.order ?? -1) + 1,
        round: (maxRound._max.round ?? 1) + 1,
        portionsPerPerson: original.portionsPerPerson,
        manualQuantity: original.manualQuantity,
      },
    });
    return { success: true, entry };
  });

  app.patch('/kitchen/display/events/:eventId/plan/reorder', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId } = request.params as { eventId: string };
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

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

    return { success: true, reordered: ordered.length };
  });

  app.delete('/kitchen/display/plan/entries/:entryId', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const { entryId } = request.params as { entryId: string };
    const eventId = await entryEventId(entryId);
    if (!eventId) return reply.status(404).send({ error: 'Saída não encontrada.' });
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

    await prisma.kitchenServicePlanEntry.delete({ where: { id: entryId } });
    return { success: true };
  });
}
