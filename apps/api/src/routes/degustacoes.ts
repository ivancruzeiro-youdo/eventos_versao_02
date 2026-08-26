import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../server.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getUserpToken, verifyUserpToken, userpFetch } from '../lib/userp-auth.js';

const WRITE_ROLES = ['admin', 'event_owner', 'operator'];
const DAY_MS = 24 * 60 * 60 * 1000;
const WEB_URL = process.env.WEB_URL || 'https://eventos.youdobrasil.com.br';

// `fones`/`emails` da Userp vêm como listas de OBJETOS ({id, nome, fone, fone_padrao}, idem
// pra email) — não strings. Pega o marcado como padrão; sem nenhum marcado, usa o primeiro.
function pickPadrao(list: any[] | undefined, valueKey: string, flagKey: string): string | null {
  if (!list?.length) return null;
  const padrao = list.find((i) => i?.[flagKey]) ?? list[0];
  return padrao?.[valueKey] ?? null;
}

// Erro de CONEXÃO/AUTENTICAÇÃO com a Userp — distinto de "entidade não existe". Antes as duas
// situações viravam a mesma coisa (fetchUserpEntidade retornava null pros dois casos), e um
// 401 intermitente de token (já visto antes nesse projeto, ver getUserpLoginToken) aparecia
// pro operador como "Entidade não encontrada no Userp" — mensagem errada que mandava procurar
// no lugar errado quando na real era a Userp/rede que tinha falhado, não a entidade.
class UserpUpstreamError extends Error {}

async function fetchUserpEntidade(userpEntidadeId: number): Promise<{ nome: string; telefone: string | null; email: string | null } | null> {
  // userpFetch já refaz a chamada 1x com token novo se vier 401 — sessão única por conta na
  // Userp, um login concorrente (nosso ou de fora) invalida o token cacheado sem isso ser um
  // problema real de credencial ou de entidade inexistente.
  const res = await userpFetch(`/api/userp-satelite/entidades/index.php?id=${userpEntidadeId}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new UserpUpstreamError(`Falha ao consultar entidade na Userp (HTTP ${res.status}) — pode não significar que a entidade não existe.`);
  }
  const data: any = await res.json();
  const entidade = data?.items?.[0] ?? (data?.nome_razao_social ? data : null);
  if (!entidade) return null; // resposta OK da Userp, mas sem a entidade — aí sim não existe
  return {
    nome: entidade.nome_razao_social,
    telefone: pickPadrao(entidade.fones, 'fone', 'fone_padrao'),
    email: pickPadrao(entidade.emails, 'email', 'email_padrao'),
  };
}

// Um produto sinaliza "item escolhido" por UM de dois mecanismos, nunca os dois — subitens
// (EventItemChoice, ex.: Buffet 01, "Massas (escolher 1)") ou perguntas de configuração
// (EventItemAnswer, ex.: Finger Food 01, "Entradas (escolher 4) — quais itens deseja servir?").
// answer é Json (string | string[]), por isso o parse manual em vez de só checar length.
function answerToChosen(answer: any): string[] {
  if (Array.isArray(answer)) return answer.filter((s: any): s is string => typeof s === 'string' && s.trim().length > 0);
  if (typeof answer === 'string' && answer.trim()) return [answer];
  return [];
}

function hasAnyMenuSelection(menuItem: { choices?: { chosen: string[] }[]; answers?: { answer: any }[] } | null | undefined): boolean {
  if (!menuItem) return false;
  const fromChoices = menuItem.choices?.some(c => c.chosen.length > 0) ?? false;
  const fromAnswers = menuItem.answers?.some(a => answerToChosen(a.answer).length > 0) ?? false;
  return fromChoices || fromAnswers;
}

// Resolve a ocorrência de fato pra um DegustacaoLink: se já inscrito, é a mesma de sempre; senão,
// se a âncora faz parte de uma série, é a próxima ainda não realizada dessa série (não a âncora
// em si) — assim o link sobrevive a toda a recorrência sem staff precisar gerar um novo a cada
// data. Sem série, é sempre a própria âncora.
// Itens escolhidos do menu (aba A&B) vêm junto com a ocorrência resolvida — cada ocorrência
// da série tem seu próprio EventItem/EventItemChoice/EventItemAnswer, então isso não pode vir
// só da âncora.
const OCCURRENCE_INCLUDE = {
  venues: { include: { venue: true } },
  degustacao: { include: { product: { select: { id: true, name: true } } } },
  items: {
    where: { category: 'ab' },
    include: { choices: true, answers: { include: { question: { select: { id: true, text: true } } } } },
  },
} as const;

async function resolveLinkOccurrence(link: any) {
  if (link.enrolledEventId) {
    return prisma.event.findUnique({ where: { id: link.enrolledEventId }, include: OCCURRENCE_INCLUDE });
  }

  const anchor = link.degustacao;
  if (!anchor.seriesId) {
    return prisma.event.findUnique({ where: { id: anchor.eventId }, include: OCCURRENCE_INCLUDE });
  }

  const next = await prisma.event.findFirst({
    where: { degustacao: { seriesId: anchor.seriesId }, startAt: { gte: new Date() } },
    include: OCCURRENCE_INCLUDE,
    orderBy: { startAt: 'asc' },
  });
  if (next) return next;

  // Série inteira já passou — devolve a âncora mesmo assim, pra tela mostrar algo coerente
  // ("essa data já passou") em vez de um 404 seco.
  return prisma.event.findUnique({ where: { id: anchor.eventId }, include: OCCURRENCE_INCLUDE });
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

// Autenticação compartilhada das rotas externas (chat): token EMITIDO PELA USERP no header
// Authorization, validado chamando de volta verify-token/index.php — ver verifyUserpToken().
async function requireUserpBearer(request: any): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { ok: false, status: 401, error: 'Header Authorization: Bearer <token Userp> é obrigatório.' };

  let verified: { valid: boolean };
  try {
    verified = await verifyUserpToken(token);
  } catch {
    return { ok: false, status: 502, error: 'Não foi possível validar o token junto à Userp.' };
  }
  if (!verified.valid) return { ok: false, status: 401, error: 'Token Userp inválido ou expirado.' };
  return { ok: true };
}

type LinkResult =
  | { error: string; status: number }
  | { link: any; url: string; alreadyExisted: boolean };

// Núcleo de "gerar (ou devolver, se já existir) o link público de uma entidade Userp pra esta
// degustação" — compartilhado entre a rota de staff (POST /degustacoes/:id/links, login nosso)
// e a rota pública pra sistemas externos (POST /degustacoes/:id/links/external, token da Userp).
// As duas fazem exatamente a mesma coisa depois de autenticar por caminhos diferentes.
async function createOrGetDegustacaoLink(
  eventId: string,
  userpEntidadeId: number,
  createdById: string | null,
): Promise<LinkResult> {
  const degustacao = await (prisma as any).degustacao.findUnique({ where: { eventId } });
  if (!degustacao) return { error: 'Degustação não encontrada.', status: 404 };
  if (degustacao.visibility !== 'publico') {
    return { error: 'Geração de link só se aplica a degustações públicas.', status: 400 };
  }

  // Sem menu escolhido ainda, o link levaria o convidado a uma página sem nenhuma informação
  // do que vai ser servido — bloqueado até a aba A&B do evento ter pelo menos um item escolhido
  // (mesma tela/mecanismo já usado em qualquer evento normal).
  if (!degustacao.productId) {
    return { error: 'Defina o menu (produto) da degustação antes de gerar links.', status: 400 };
  }
  const menuItem = await prisma.eventItem.findFirst({
    where: { eventId, category: 'ab', productId: degustacao.productId },
    include: { choices: true, answers: true },
  });
  if (!hasAnyMenuSelection(menuItem)) {
    return { error: 'Escolha os itens do menu na aba A&B do evento antes de gerar links.', status: 400 };
  }

  const existing = await (prisma as any).degustacaoLink.findUnique({
    where: { degustacaoId_userpEntidadeId: { degustacaoId: degustacao.id, userpEntidadeId } },
  });
  if (existing) {
    return { link: existing, url: `${WEB_URL}/degustacao/${existing.token}`, alreadyExisted: true };
  }

  let entidade;
  try {
    entidade = await fetchUserpEntidade(userpEntidadeId);
  } catch (e: any) {
    return { error: e.message, status: e instanceof UserpUpstreamError ? 502 : 400 };
  }
  if (!entidade) return { error: 'Entidade não encontrada no Userp.', status: 404 };

  const link = await (prisma as any).degustacaoLink.create({
    data: {
      degustacaoId: degustacao.id,
      userpEntidadeId,
      nome: entidade.nome,
      telefone: entidade.telefone,
      email: entidade.email,
      createdById,
    },
  });
  return { link, url: `${WEB_URL}/degustacao/${link.token}`, alreadyExisted: false };
}

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
        degustacao: {
          include: {
            product: { select: { id: true, name: true } },
            // Só o essencial pra contar — evitar trazer nome/telefone/token de todo mundo aqui.
            links: { select: { enrolledEventId: true } },
            enrollments: { select: { id: true } },
          },
        },
        _count: { select: { guests: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    // Um link é ANCORADO nesta ocorrência mas pode ter resolvido e confirmado presença numa
    // outra data da série (ver resolveLinkOccurrence) — "confirmados" conta só quem confirmou
    // PRA ESTA data específica, não qualquer link que só nasceu aqui.
    const degustacoes = events.map((e: any) => ({
      ...e,
      degustacao: e.degustacao ? {
        ...e.degustacao,
        linksTotal: e.degustacao.links?.length ?? 0,
        linksConfirmed: e.degustacao.links?.filter((l: any) => l.enrolledEventId === e.id).length ?? 0,
        enrollmentsCount: e.degustacao.enrollments?.length ?? 0,
        links: undefined,
        enrollments: undefined,
      } : null,
    }));

    return { success: true, degustacoes };
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

    const user = (request as any).user;
    const result = await createOrGetDegustacaoLink(id, userpEntidadeId, user.id);
    if ('error' in result) return reply.status(result.status).send({ error: result.error });
    if (result.alreadyExisted) {
      return reply.status(409).send({ error: 'Link já existe para esta entidade.', link: result.link, url: result.url });
    }
    return reply.status(201).send({ success: true, link: result.link, url: result.url });
  });

  // Mesma geração de link, mas para o sistema de CHAT externo: sem login de staff, autenticado
  // por um token EMITIDO PELA USERP (Authorization: Bearer) que a gente valida chamando de
  // volta verify-token/index.php — igual à Acessos confirmando o Bearer que a gente manda pra
  // ela. Idempotente igual à rota de staff: pedir de novo pra mesma entidade devolve o mesmo link.
  app.post('/degustacoes/:id/links/external', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userpEntidadeId } = request.body as { userpEntidadeId?: number };
    if (!userpEntidadeId) return reply.status(400).send({ error: 'userpEntidadeId é obrigatório.' });

    const auth = await requireUserpBearer(request);
    if (!auth.ok) return reply.status(auth.status).send({ error: auth.error });

    const result = await createOrGetDegustacaoLink(id, userpEntidadeId, null);
    if ('error' in result) return reply.status(result.status).send({ error: result.error });
    if (result.alreadyExisted) {
      return reply.status(200).send({ success: true, link: result.link, url: result.url });
    }
    return reply.status(201).send({ success: true, link: result.link, url: result.url });
  });

  // Lista, pro sistema de CHAT externo, as degustações prontas pra gerar link agora: públicas,
  // com menu definido, com pelo menos um item já escolhido na aba A&B, e ainda no futuro — as
  // MESMAS condições que POST /links/external exige, então tudo que aparece aqui tem garantia
  // de funcionar quando o chat pedir o link. Mesma autenticação (token Userp) das outras rotas
  // externas, não expõe nada pra quem não tiver um token válido da Userp.
  app.get('/degustacoes/available/external', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const auth = await requireUserpBearer(request);
    if (!auth.ok) return reply.status(auth.status).send({ error: auth.error });

    const events = await prisma.event.findMany({
      where: {
        degustacao: { is: { visibility: 'publico', productId: { not: null } } },
        startAt: { gte: new Date() },
      },
      include: {
        venues: { include: { venue: true } },
        degustacao: { include: { product: { select: { id: true, name: true } } } },
        items: { where: { category: 'ab' }, include: { choices: true, answers: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    const degustacoes = events
      .filter((e: any) => {
        const menuItem = (e.items ?? []).find((it: any) => it.productId === e.degustacao.productId);
        return hasAnyMenuSelection(menuItem);
      })
      .map((e: any) => ({
        id: e.id,
        name: e.name,
        startAt: e.startAt,
        venues: e.venues.map((v: any) => v.venue.name),
        menu: e.degustacao.product?.name ?? null,
        maxGuests: e.degustacao.maxGuests,
      }));

    return { success: true, degustacoes };
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

  // Remove um link ainda não usado — só permitido enquanto "Pendente" (enrolledEventId nulo);
  // uma vez que alguém se inscreveu por ele, apagar destruiria o único registro de quem
  // confirmou presença, então fica bloqueado (a pessoa continua com o link, só não dá pra
  // reaproveitar o código de entidade pra outro convite).
  app.delete('/degustacoes/:id/links/:linkId', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const { id, linkId } = request.params as { id: string; linkId: string };
    const degustacao = await (prisma as any).degustacao.findUnique({ where: { eventId: id } });
    if (!degustacao) return reply.status(404).send({ error: 'Degustação não encontrada.' });

    const link = await (prisma as any).degustacaoLink.findFirst({ where: { id: linkId, degustacaoId: degustacao.id } });
    if (!link) return reply.status(404).send({ error: 'Link não encontrado.' });
    if (link.enrolledEventId) {
      return reply.status(409).send({ error: 'Esse link já tem inscrição confirmada e não pode ser removido.' });
    }

    await (prisma as any).degustacaoLink.delete({ where: { id: linkId } });
    return { success: true };
  });

  // Edita os convidados de um link JÁ inscrito — adiciona/remove nomes sem perder o histórico
  // (check-in, status) de quem não mudou. Reconhece cada Guest pelo degustacaoLinkId, nunca
  // por busca aberta no evento (dois links diferentes podem ter convidados com o mesmo nome).
  app.patch('/degustacoes/:id/links/:linkId/guests', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const { id, linkId } = request.params as { id: string; linkId: string };
    const { nomes } = request.body as { nomes?: string[] };

    const degustacao = await (prisma as any).degustacao.findUnique({ where: { eventId: id } });
    if (!degustacao) return reply.status(404).send({ error: 'Degustação não encontrada.' });

    const link = await (prisma as any).degustacaoLink.findFirst({ where: { id: linkId, degustacaoId: degustacao.id } });
    if (!link) return reply.status(404).send({ error: 'Link não encontrado.' });
    if (!link.enrolledEventId) return reply.status(400).send({ error: 'Esse link ainda não tem inscrição confirmada — nada para editar.' });

    const cleanNomes = (nomes ?? []).map((n: string) => n.trim()).filter(Boolean);
    if (cleanNomes.length > degustacao.maxGuests) {
      return reply.status(400).send({ error: `Máximo de ${degustacao.maxGuests} convidados.` });
    }

    let currentGuests = await prisma.guest.findMany({ where: { degustacaoLinkId: link.id } });

    // Self-heal com escopo travado: link inscrito antes desta migration tem Guest reais, só
    // sem a marca. Só adota se achar EXATAMENTE os nomes do próprio snapshot — nunca varre o
    // evento inteiro (evitaria "roubar" convidado de outro link com nome coincidente).
    if (currentGuests.length === 0 && link.enrolledGuestNames.length > 0) {
      const candidates = await prisma.guest.findMany({
        where: { eventId: link.enrolledEventId, degustacaoLinkId: null, name: { in: link.enrolledGuestNames } },
      });
      if (candidates.length !== link.enrolledGuestNames.length) {
        return reply.status(409).send({
          error: 'Não foi possível confirmar com segurança quais convidados pertencem a este link (nomes duplicados entre links ou dados já alterados). Reconcilie manualmente antes de editar.',
        });
      }
      await prisma.guest.updateMany({
        where: { id: { in: candidates.map((g) => g.id) } },
        data: { degustacaoLinkId: link.id },
      });
      currentGuests = candidates;
    }

    // Diff por nome, primeiro-casamento-vence — quem não mudou fica intocado (preserva
    // checkedInAt/status); nunca apaga e recria um nome só porque foi retranscrito igual.
    const pool = [...currentGuests];
    const toCreateNames: string[] = [];
    for (const name of cleanNomes) {
      const idx = pool.findIndex((g) => g.name === name);
      if (idx !== -1) pool.splice(idx, 1);
      else toCreateNames.push(name);
    }
    const toRemove = pool;

    const blockedCheckedIn = toRemove.filter((g) => g.checkedInAt);
    if (blockedCheckedIn.length > 0) {
      return reply.status(409).send({
        error: `Já fez check-in, não pode ser removido: ${blockedCheckedIn.map((g) => g.name).join(', ')}. Desfaça o check-in na aba de convidados do evento antes de remover.`,
      });
    }

    const ops: any[] = [];
    if (toRemove.length) {
      ops.push(prisma.guest.deleteMany({ where: { id: { in: toRemove.map((g) => g.id) } } }));
    }
    if (toCreateNames.length) {
      ops.push(prisma.guest.createMany({
        data: toCreateNames.map((name) => ({ eventId: link.enrolledEventId, name, degustacaoLinkId: link.id })),
      }));
    }
    ops.push((prisma as any).degustacaoLink.update({ where: { id: linkId }, data: { enrolledGuestNames: cleanNomes } }));
    await prisma.$transaction(ops);

    const updatedLink = await (prisma as any).degustacaoLink.findUnique({ where: { id: linkId } });
    return { success: true, link: updatedLink };
  });

  // Observação interna da equipe sobre um link — NUNCA exposta na rota pública abaixo. Não
  // exige enrolledEventId: faz sentido anotar mesmo num link ainda pendente.
  app.patch('/degustacoes/:id/links/:linkId/notes', { preHandler: [requireAuth, requireRole(WRITE_ROLES)] }, async (request, reply) => {
    const { id, linkId } = request.params as { id: string; linkId: string };
    const { notes } = request.body as { notes?: string | null };

    const degustacao = await (prisma as any).degustacao.findUnique({ where: { eventId: id } });
    if (!degustacao) return reply.status(404).send({ error: 'Degustação não encontrada.' });

    const link = await (prisma as any).degustacaoLink.findFirst({ where: { id: linkId, degustacaoId: degustacao.id } });
    if (!link) return reply.status(404).send({ error: 'Link não encontrado.' });

    const clean = (notes ?? '').trim() || null;
    const updated = await (prisma as any).degustacaoLink.update({ where: { id: linkId }, data: { notes: clean } });
    return { success: true, link: updated };
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

    // Itens escolhidos na aba A&B do evento — vêm de UM dos dois mecanismos (ver
    // hasAnyMenuSelection acima): subitens (EventItemChoice) ou perguntas de configuração
    // do produto (EventItemAnswer). Mostrados como confirmação do que vai ser servido.
    const menuItem = (event as any).items?.[0];
    const fromChoices = (menuItem?.choices ?? [])
      .filter((c: any) => c.chosen.length > 0)
      .map((c: any) => ({ label: c.label, chosen: c.chosen }));
    const fromAnswers = (menuItem?.answers ?? [])
      .map((a: any) => ({ label: a.question?.text ?? '', chosen: answerToChosen(a.answer) }))
      .filter((a: any) => a.chosen.length > 0);
    const menuChoices = [...fromChoices, ...fromAnswers];

    return {
      success: true,
      confirmed: !!link.enrolledEventId,
      contato: { nome: link.nome, telefone: link.telefone, email: link.email },
      degustacao: { maxGuests: link.degustacao.maxGuests, menu: link.degustacao.product?.name ?? null },
      menuChoices,
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
      data: cleanNomes.map(name => ({ eventId: event.id, name, degustacaoLinkId: link.id })),
    });
    await (prisma as any).degustacaoLink.update({
      where: { token },
      data: { enrolledEventId: event.id, enrolledAt: new Date(), enrolledGuestNames: cleanNomes },
    });

    return reply.status(201).send({ success: true, eventId: event.id });
  });

  // Debug admin-only: mostra a resposta CRUA da Userp pra uma entidade, sem passar pelo parse
  // de fetchUserpEntidade — pra diagnosticar "entidade X não existe" quando ela existe de fato
  // na Userp (formato de resposta inesperado, id em campo diferente, etc.). Mesmo padrão de
  // apps/api/src/routes/auth.ts (GET /sso-debug).
  app.get('/degustacoes/debug/entidade/:userpEntidadeId', { preHandler: [requireAuth, requireRole(['admin'])] }, async (request, reply) => {
    const { userpEntidadeId } = request.params as { userpEntidadeId: string };
    const { token, baseUrl } = await getUserpToken();
    const url = `${baseUrl}/api/userp-satelite/entidades/index.php?id=${userpEntidadeId}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const rawText = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(rawText); } catch { /* corpo não-JSON — devolve cru mesmo */ }
    return {
      url,
      status: res.status,
      ok: res.ok,
      parsed,
      rawText: parsed ? undefined : rawText.slice(0, 2000),
    };
  });
}
