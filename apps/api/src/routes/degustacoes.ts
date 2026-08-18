import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../server.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const WRITE_ROLES = ['admin', 'event_owner', 'operator'];
const DAY_MS = 24 * 60 * 60 * 1000;
const WEB_URL = process.env.WEB_URL || 'https://eventos.youdobrasil.com.br';

// Mesmo mecanismo de auth já usado pelo sync do Userp (sync-events.ts) — duplicado aqui de
// propósito, seguindo a convenção já estabelecida no repo de cada arquivo de rota ter sua
// própria cópia em vez de compartilhar um módulo (ver WRITE_ROLES repetido em outros arquivos).
async function getUserpToken(): Promise<{ token: string; baseUrl: string }> {
  const rows = await (prisma as any).uerpConfig.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const baseUrl = map['userpBaseUrl'] || '';
  const email = map['userpEmail'] || '';
  const senha = map['userpSenha'] || '';
  if (!baseUrl || !email || !senha) throw new Error('Credenciais Userp não configuradas.');
  const res = await fetch(`${baseUrl}/api/userp-satelite/auth/token.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  if (!res.ok) throw new Error('Falha na autenticação Userp.');
  const data: any = await res.json();
  if (!data.access_token) throw new Error('Token não retornado pelo Userp.');
  return { token: data.access_token, baseUrl };
}

async function fetchUserpEntidade(userpEntidadeId: number): Promise<{ nome: string; telefone: string | null; email: string | null } | null> {
  const { token, baseUrl } = await getUserpToken();
  const res = await fetch(`${baseUrl}/api/userp-satelite/entidades/index.php?id=${userpEntidadeId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data: any = await res.json();
  const entidade = data?.items?.[0] ?? (data?.nome_razao_social ? data : null);
  if (!entidade) return null;
  return {
    nome: entidade.nome_razao_social,
    telefone: entidade.fones?.[0] ?? null,
    email: entidade.emails?.[0] ?? null,
  };
}

// Resolve a ocorrência de fato pra um DegustacaoLink: se já inscrito, é a mesma de sempre; senão,
// se a âncora faz parte de uma série, é a próxima ainda não realizada dessa série (não a âncora
// em si) — assim o link sobrevive a toda a recorrência sem staff precisar gerar um novo a cada
// data. Sem série, é sempre a própria âncora.
async function resolveLinkOccurrence(link: any) {
  if (link.enrolledEventId) {
    return prisma.event.findUnique({
      where: { id: link.enrolledEventId },
      include: { venues: { include: { venue: true } }, degustacao: { include: { product: { select: { id: true, name: true } } } } },
    });
  }

  const anchor = link.degustacao;
  if (!anchor.seriesId) {
    return prisma.event.findUnique({
      where: { id: anchor.eventId },
      include: { venues: { include: { venue: true } }, degustacao: { include: { product: { select: { id: true, name: true } } } } },
    });
  }

  const next = await prisma.event.findFirst({
    where: { degustacao: { seriesId: anchor.seriesId }, startAt: { gte: new Date() } },
    include: { venues: { include: { venue: true } }, degustacao: { include: { product: { select: { id: true, name: true } } } } },
    orderBy: { startAt: 'asc' },
  });
  if (next) return next;

  // Série inteira já passou — devolve a âncora mesmo assim, pra tela mostrar algo coerente
  // ("essa data já passou") em vez de um 404 seco.
  return prisma.event.findUnique({
    where: { id: anchor.eventId },
    include: { venues: { include: { venue: true } }, degustacao: { include: { product: { select: { id: true, name: true } } } } },
  });
}

const createDegustacaoSchema = z.object({
  name: z.string().min(1).optional(),
  venueIds: z.array(z.string()).optional(),
  productId: z.string().optional(),
  visibility: z.enum(['publico', 'contrato']),
  maxGuests: z.number().int().min(1).max(50).optional(),
  startAt: z.string().datetime(),
  teardownAt: z.string().datetime().optional(),
  notes: z.string().optional(),
  recurrence: z.object({
    intervalDays: z.number().int().min(1).max(365),
    count: z.number().int().min(2).max(52),
  }).optional(),
});

const updateDegustacaoSchema = z.object({
  productId: z.string().nullable().optional(),
  visibility: z.enum(['publico', 'contrato']).optional(),
  maxGuests: z.number().int().min(1).max(50).optional(),
  startAt: z.string().datetime().optional(),
  teardownAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export async function degustacaoRoutes(app: FastifyInstance) {
  // Create — sem `recurrence`, cria uma ocorrência; com `recurrence`, cria N Events reais de
  // uma vez (decisão de produto: lote fixo, sem cron/job por trás), todos compartilhando
  // `seriesId` pra depois serem listados juntos.
  app.post('/degustacoes', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const user = (request as any).user;
    const data = createDegustacaoSchema.parse(request.body);

    const employerId = user.role === 'admin'
      ? (request.body as any).employerId || user.employerId
      : user.employerId;
    if (!employerId) return reply.status(400).send({ error: 'employerId é obrigatório.' });

    let product: { id: string; name: string } | null = null;
    if (data.productId) {
      product = await prisma.product.findUnique({ where: { id: data.productId }, select: { id: true, name: true } });
      if (!product) return reply.status(404).send({ error: 'Produto (menu) não encontrado.' });
    }

    const count = data.recurrence?.count ?? 1;
    const intervalDays = data.recurrence?.intervalDays ?? 0;
    const seriesId = count > 1 ? randomUUID() : null;
    const maxGuests = data.maxGuests ?? 4;

    const baseStart = new Date(data.startAt);
    const baseTeardown = data.teardownAt ? new Date(data.teardownAt) : null;
    const durationMs = baseTeardown ? baseTeardown.getTime() - baseStart.getTime() : null;
    const eventName = data.name || `Degustação${product ? ` — ${product.name}` : ''}`;

    const created: any[] = [];
    for (let i = 0; i < count; i++) {
      const startAt = new Date(baseStart.getTime() + i * intervalDays * DAY_MS);
      const teardownAt = durationMs !== null ? new Date(startAt.getTime() + durationMs) : null;

      const event = await prisma.event.create({
        data: {
          name: eventName,
          publicName: eventName,
          clientName: eventName,
          employerId,
          status: 'confirmed',
          startAt,
          teardownAt,
          notes: data.notes,
          venues: data.venueIds?.length ? { create: data.venueIds.map(venueId => ({ venueId })) } : undefined,
          degustacao: {
            create: {
              visibility: data.visibility,
              productId: data.productId ?? null,
              maxGuests,
              seriesId,
              seriesIndex: seriesId ? i : null,
              seriesIntervalDays: seriesId ? intervalDays : null,
              createdById: user.id,
            },
          },
          // Menu fixado pelo staff aqui mesmo, na criação — mesmo mecanismo de A&B de um
          // evento normal (EventItem categoria 'ab'), pra aba administrativa já funcionar
          // sem tela nova. quantity = maxGuests, mesma convenção usada pra headcount de A&B.
          items: product ? {
            create: [{ productId: product.id, category: 'ab', name: product.name, quantity: maxGuests }],
          } : undefined,
        },
        include: {
          venues: { include: { venue: true } },
          degustacao: true,
          items: true,
        },
      });

      created.push(event);
    }

    return reply.status(201).send({ success: true, events: created });
  });

  // List — filtra por visibilidade/período; sempre só ocorrências que SÃO degustação.
  app.get('/degustacoes', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { visibility, from, to } = request.query as { visibility?: string; from?: string; to?: string };

    const where: any = { degustacao: { isNot: null } };
    if (user.role !== 'admin') where.employerId = user.employerId;
    if (visibility) where.degustacao = { is: { visibility } };
    if (from || to) {
      where.startAt = {};
      if (from) where.startAt.gte = new Date(from);
      if (to) where.startAt.lte = new Date(to);
    }

    const events = await prisma.event.findMany({
      where,
      include: {
        venues: { include: { venue: true } },
        degustacao: { include: { product: { select: { id: true, name: true } } } },
        _count: { select: { guests: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    return { success: true, degustacoes: events };
  });

  // Detail — inclui as outras ocorrências da mesma série, pra tela mostrar o calendário todo.
  app.get('/degustacoes/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        venues: { include: { venue: true } },
        guests: true,
        degustacao: {
          include: {
            product: { select: { id: true, name: true } },
            links: { orderBy: { createdAt: 'desc' } },
            enrollments: true,
          },
        },
      },
    });
    if (!event?.degustacao) return reply.status(404).send({ error: 'Degustação não encontrada.' });

    const series = event.degustacao.seriesId
      ? await prisma.event.findMany({
          where: { degustacao: { seriesId: event.degustacao.seriesId } },
          select: { id: true, startAt: true, degustacao: { select: { seriesIndex: true } } },
          orderBy: { startAt: 'asc' },
        })
      : [];

    return { success: true, event, series };
  });

  // Update — edita só ESTA ocorrência (produto, capacidade, visibilidade, data, notas); não
  // propaga pra série, cada ocorrência é um Event independente como qualquer outro.
  app.patch('/degustacoes/:id', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateDegustacaoSchema.parse(request.body);

    const existing = await prisma.event.findUnique({ where: { id }, include: { degustacao: true } });
    if (!existing?.degustacao) return reply.status(404).send({ error: 'Degustação não encontrada.' });

    const degustacaoData: any = {};
    if (data.visibility !== undefined) degustacaoData.visibility = data.visibility;
    if (data.maxGuests !== undefined) degustacaoData.maxGuests = data.maxGuests;
    if (data.productId !== undefined) degustacaoData.productId = data.productId;

    const event = await prisma.event.update({
      where: { id },
      data: {
        startAt: data.startAt !== undefined ? new Date(data.startAt) : undefined,
        teardownAt: data.teardownAt !== undefined ? new Date(data.teardownAt) : undefined,
        notes: data.notes,
        degustacao: Object.keys(degustacaoData).length ? { update: degustacaoData } : undefined,
      },
      include: { degustacao: true, venues: { include: { venue: true } } },
    });

    return { success: true, event };
  });

  // Gera (ou devolve, se já existir) o link público de uma entidade Userp pra esta degustação
  // — a âncora da série. 1 link por entidade por âncora (mesma regra de idempotência do
  // sistema antigo): gerar de novo pra mesma combinação não duplica, devolve o link existente.
  app.post('/degustacoes/:id/links', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userpEntidadeId } = request.body as { userpEntidadeId?: number };
    if (!userpEntidadeId) return reply.status(400).send({ error: 'userpEntidadeId é obrigatório.' });

    const degustacao = await (prisma as any).degustacao.findUnique({ where: { eventId: id } });
    if (!degustacao) return reply.status(404).send({ error: 'Degustação não encontrada.' });
    if (degustacao.visibility !== 'publico') {
      return reply.status(400).send({ error: 'Geração de link só se aplica a degustações públicas.' });
    }

    const existing = await (prisma as any).degustacaoLink.findUnique({
      where: { degustacaoId_userpEntidadeId: { degustacaoId: degustacao.id, userpEntidadeId } },
    });
    if (existing) {
      return reply.status(409).send({ error: 'Link já existe para esta entidade.', link: existing, url: `${WEB_URL}/degustacao/${existing.token}` });
    }

    let entidade;
    try {
      entidade = await fetchUserpEntidade(userpEntidadeId);
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }
    if (!entidade) return reply.status(404).send({ error: 'Entidade não encontrada no Userp.' });

    const user = (request as any).user;
    const link = await (prisma as any).degustacaoLink.create({
      data: {
        degustacaoId: degustacao.id,
        userpEntidadeId,
        nome: entidade.nome,
        telefone: entidade.telefone,
        email: entidade.email,
        createdById: user.id,
      },
    });

    return reply.status(201).send({ success: true, link, url: `${WEB_URL}/degustacao/${link.token}` });
  });

  // Lista os links já gerados pra esta degustação (âncora), com status de inscrição de cada.
  app.get('/degustacoes/:id/links', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const degustacao = await (prisma as any).degustacao.findUnique({ where: { eventId: id } });
    if (!degustacao) return reply.status(404).send({ error: 'Degustação não encontrada.' });

    const links = await (prisma as any).degustacaoLink.findMany({
      where: { degustacaoId: degustacao.id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      links: links.map((l: any) => ({ ...l, url: `${WEB_URL}/degustacao/${l.token}` })),
    };
  });

  // --- Link público: sem auth de staff nem de cliente — o token É a credencial ---

  // Resolve e devolve a ocorrência atual do link: a próxima aberta da série, ou a confirmada
  // se a pessoa já se inscreveu.
  app.get('/degustacao-link/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const link = await (prisma as any).degustacaoLink.findUnique({
      where: { token },
      include: { degustacao: { include: { product: { select: { id: true, name: true } } } } },
    });
    if (!link) return reply.status(404).send({ error: 'Link inválido.' });

    const event = await resolveLinkOccurrence(link);
    if (!event) return reply.status(404).send({ error: 'Ocorrência não encontrada.' });

    return {
      success: true,
      confirmed: !!link.enrolledEventId,
      contato: { nome: link.nome, telefone: link.telefone, email: link.email },
      degustacao: { maxGuests: link.degustacao.maxGuests, menu: link.degustacao.product?.name ?? null },
      event: {
        id: event.id,
        startAt: (event as any).startAt,
        venues: (event as any).venues.map((v: any) => ({ name: v.venue.name })),
      },
    };
  });

  // Inscreve os convidados na ocorrência resolvida — uma vez usado, o link vira somente-leitura
  // (enrolledEventId setado), nunca deixa reinscrever nem trocar de data.
  app.post('/degustacao-link/:token/guests', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const { nomes } = request.body as { nomes?: string[] };

    const link = await (prisma as any).degustacaoLink.findUnique({
      where: { token },
      include: { degustacao: true },
    });
    if (!link) return reply.status(404).send({ error: 'Link inválido.' });
    if (link.enrolledEventId) return reply.status(409).send({ error: 'Esse link já foi usado pra se inscrever.' });

    const cleanNomes = (nomes ?? []).map(n => n.trim()).filter(Boolean);
    if (cleanNomes.length === 0) return reply.status(400).send({ error: 'Informe ao menos um nome.' });
    if (cleanNomes.length > link.degustacao.maxGuests) {
      return reply.status(400).send({ error: `Máximo de ${link.degustacao.maxGuests} convidados.` });
    }

    const event = await resolveLinkOccurrence(link);
    if (!event) return reply.status(404).send({ error: 'Ocorrência não encontrada.' });
    if ((event as any).startAt && (event as any).startAt < new Date()) {
      return reply.status(409).send({ error: 'Essa data já passou — não há mais ocorrências futuras nesta série.' });
    }

    await prisma.guest.createMany({
      data: cleanNomes.map(name => ({ eventId: event.id, name })),
    });
    await (prisma as any).degustacaoLink.update({
      where: { token },
      data: { enrolledEventId: event.id, enrolledAt: new Date() },
    });

    return reply.status(201).send({ success: true, eventId: event.id });
  });
}
