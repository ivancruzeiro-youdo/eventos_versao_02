import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import * as acessosClient from '../services/acessos.js';

// Shared `select` for every Freelancer row ever returned to a client — passwordHash
// (bcrypt) must never leave the server, this is the single place that decides what's safe.
const FREELANCER_SAFE_SELECT = {
  id: true, name: true, email: true, cpf: true, phone: true, birthDate: true,
  status: true, strikeCount: true, fotoBase64: true, createdAt: true, updatedAt: true,
} as const;

async function handleAcessoGrant(applicationId: string): Promise<void> {
  const application = await prisma.freelancerApplication.findUnique({
    where: { id: applicationId },
    include: {
      freelancer: true,
      event: {
        include: {
          services: {
            include: { service: { include: { acessoMappings: true } } },
          },
        },
      },
    },
  });

  if (!application) return;

  // Encontra o slot do serviço com as datas e mapeamentos de acesso
  const slot = application.event.services.find(
    (s: any) => s.service.name === application.role,
  );

  if (!slot || !slot.service.acessoMappings.length) return;

  const acessos = slot.service.acessoMappings.map((m: any) => ({
    acesso_id: m.acessoId,
    data_inicio: slot.startAt ? slot.startAt.toISOString().split('T')[0] : undefined,
    data_fim: slot.endAt ? slot.endAt.toISOString().split('T')[0] : undefined,
  }));

  const payload: any = {
    nome: application.freelancer.name,
    cpf: application.freelancer.cpf,
    acessos,
  };
  if ((application.freelancer as any).fotoBase64) {
    payload.foto_base64 = (application.freelancer as any).fotoBase64;
  }

  let acessoExternoId: string | null = null;
  let status = 'granted';
  let response: any = null;

  try {
    const result = await acessosClient.grantAccess(payload);
    acessoExternoId = result.id;
    response = result;
  } catch (err: any) {
    status = 'error';
    response = { error: err.message };
  }

  await (prisma as any).acessoLog.create({
    data: {
      freelancerId: application.freelancerId,
      applicationId,
      acessoExternoId,
      status,
      payload,
      response,
    },
  });
}

async function handleAcessoRevoke(applicationId: string): Promise<void> {
  const log = await (prisma as any).acessoLog.findFirst({
    where: { applicationId, status: 'granted' },
    orderBy: { createdAt: 'desc' },
  });

  if (!log?.acessoExternoId) return;

  try {
    await acessosClient.revokeAccess(log.acessoExternoId);
    await (prisma as any).acessoLog.update({
      where: { id: log.id },
      data: { status: 'revoked' },
    });
  } catch {
    // falha silenciosa — o acesso expira pela data_fim de qualquer forma
  }
}

const applySchema = z.object({
  role: z.string().min(1),
});

const penaltySchema = z.object({
  reason: z.string().min(1),
  severity: z.enum(['light', 'medium', 'grave']),
  eventId: z.string().optional(),
});

const updateApplicationSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

const loginSchema = z.object({
  email: z.string().email(),
  cpf: z.string().min(11),
  password: z.string().min(6),
});

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  cpf: z.string().min(11),
  phone: z.string().optional(),
  password: z.string().min(6),
});

export async function freelancerRoutes(app: FastifyInstance) {
  // Freelancer login
  app.post('/freelancers/auth/login', async (request, reply) => {
    const { email, cpf, password } = loginSchema.parse(request.body);

    const freelancer = await prisma.freelancer.findFirst({
      where: {
        email,
        cpf: cpf.replace(/\D/g, ''),
      },
    });

    if (!freelancer) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    if (!freelancer.passwordHash) {
      return reply.status(401).send({ error: 'Password not set' });
    }

    const valid = await bcrypt.compare(password, freelancer.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    if (freelancer.status === 'suspended') {
      return reply.status(403).send({ error: 'Account suspended' });
    }

    // Create token
    const token = await reply.jwtSign({
      sub: freelancer.id,
      email: freelancer.email,
      name: freelancer.name,
      role: 'freelancer',
    });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      success: true,
      freelancer: {
        id: freelancer.id,
        name: freelancer.name,
        email: freelancer.email,
      },
    };
  });

  // Freelancer registration
  app.post('/freelancers/auth/register', async (request, reply) => {
    const data = registerSchema.parse(request.body);

    // Check if email or CPF already exists
    const existing = await prisma.freelancer.findFirst({
      where: {
        OR: [
          { email: data.email },
          { cpf: data.cpf.replace(/\D/g, '') },
        ],
      },
    });

    if (existing) {
      return reply.status(400).send({ error: 'Email or CPF already registered' });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const freelancer = await prisma.freelancer.create({
      data: {
        name: data.name,
        email: data.email,
        cpf: data.cpf.replace(/\D/g, ''),
        phone: data.phone,
        passwordHash,
        status: 'active',
      },
    });

    // Auto login after registration
    const token = await reply.jwtSign({
      sub: freelancer.id,
      email: freelancer.email,
      name: freelancer.name,
      role: 'freelancer',
    });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return reply.status(201).send({
      success: true,
      freelancer: {
        id: freelancer.id,
        name: freelancer.name,
        email: freelancer.email,
      },
    });
  });

  // Freelancer logout
  app.post('/freelancers/auth/logout', async (request, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { success: true };
  });

  // Get current freelancer
  app.get('/freelancers/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    
    if (user.role !== 'freelancer') {
      return reply.status(403).send({ error: 'Freelancer access only' });
    }

    const freelancer = await prisma.freelancer.findUnique({
      where: { id: user.id },
      select: {
        ...FREELANCER_SAFE_SELECT,
        penalties: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        _count: {
          select: {
            applications: { where: { status: 'approved' } },
          },
        },
      },
    });

    if (!freelancer) {
      return reply.status(404).send({ error: 'Freelancer not found' });
    }

    return { success: true, freelancer };
  });

  // List jobs grouped by event for freelancer portal
  app.get('/freelancer/jobs', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    
    if (user.role !== 'freelancer') {
      return reply.status(403).send({ error: 'Freelancer access only' });
    }

    // Get this freelancer's registered service IDs
    const myServices = await prisma.freelancerServiceLink.findMany({
      where: { freelancerId: user.id },
      select: { serviceId: true },
    });
    const myServiceIds = myServices.map((s: any) => s.serviceId);

    // Get all active (non-cancelled) applications for this freelancer
    const myApplications = await prisma.freelancerApplication.findMany({
      where: { freelancerId: user.id, status: { not: 'cancelled' } },
      select: { id: true, eventId: true, role: true, status: true },
    });
    const myAppMap = new Map(myApplications.map((a: any) => [`${a.eventId}::${a.role}`, { status: a.status, id: a.id }]));

    const slotFilter: any = {
      status: 'active',
      startAt: { gte: new Date() },
      ...(myServiceIds.length > 0 ? { serviceId: { in: myServiceIds } } : {}),
    };

    const events = await prisma.event.findMany({
      where: {
        status: { in: ['confirmed', 'in_progress'] },
        services: { some: slotFilter },
      },
      include: {
        venues: { include: { venue: { select: { name: true, city: true, address: true } } } },
        employer: { select: { name: true } },
        services: {
          where: slotFilter,
          include: { service: { select: { id: true, name: true, description: true } } },
          orderBy: { startAt: 'asc' },
        },
      },
      orderBy: { startAt: 'asc' },
    });

    // Count approved applications per event+role in one query
    const eventIds = events.map((e: any) => e.id);
    const approvedCounts = eventIds.length > 0 ? await prisma.freelancerApplication.groupBy({
      by: ['eventId', 'role'],
      where: { eventId: { in: eventIds }, status: 'approved' },
      _count: { id: true },
    }) : [];
    const approvedMap = new Map((approvedCounts as any[]).map(c => [`${c.eventId}::${c.role}`, c._count.id]));

    // Enrich each slot with filledSlots and myStatus, then hide slots that are already
    // full — unless the freelancer already has an application on it (approved/pending),
    // otherwise they'd lose visibility of their own confirmed slot once it fills up.
    const enriched = (events as any[])
      .map(event => {
        const services = event.services
          .map((slot: any) => {
            const filledSlots = approvedMap.get(`${event.id}::${slot.service.name}`) ?? 0;
            const myStatus = myAppMap.get(`${event.id}::${slot.service.name}`)?.status ?? null;
            return {
              ...slot,
              filledSlots,
              myStatus,
              myApplicationId: myAppMap.get(`${event.id}::${slot.service.name}`)?.id ?? null,
            };
          })
          .filter((slot: any) => slot.filledSlots < slot.maxSlots || slot.myStatus !== null);
        return { ...event, services };
      })
      .filter(event => event.services.length > 0);

    return { success: true, jobs: enriched };
  });

  // Apply for a job slot (jobId = EventService ID)
  app.post('/freelancer/jobs/:jobId/apply', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;

    if (user.role !== 'freelancer') {
      return reply.status(403).send({ error: 'Freelancer access only' });
    }

    // requireAuth já bloqueia login/sessão de freelancer suspenso, mas essa checagem fica
    // duplicada aqui de propósito — se o middleware um dia mudar, a candidatura continua
    // protegida sem depender dele.
    if (user.status === 'suspended') {
      return reply.status(403).send({ error: 'Sua conta está suspensa e não pode se candidatar a vagas.' });
    }

    const { jobId } = request.params as { jobId: string };

    const slot = await prisma.eventService.findUnique({
      where: { id: jobId },
      include: { service: true, event: true },
    });

    if (!slot) {
      return reply.status(404).send({ error: 'Vaga não encontrada' });
    }

    if (!['confirmed', 'in_progress'].includes(slot.event.status)) {
      return reply.status(400).send({ error: 'Evento não está aceitando candidaturas' });
    }

    const existing = await prisma.freelancerApplication.findFirst({
      where: { freelancerId: user.id, eventId: slot.eventId, role: slot.service.name },
    });

    if (existing && existing.status !== 'cancelled') {
      return reply.status(400).send({ error: 'Você já se candidatou para esta vaga' });
    }

    // Block overlapping shifts: A overlaps B if A.start < B.end AND A.end > B.start
    if (slot.startAt && slot.endAt) {
      const activeApps = await prisma.freelancerApplication.findMany({
        where: { freelancerId: user.id, status: { in: ['pending', 'approved'] } },
        select: { eventId: true, role: true },
      });

      if (activeApps.length > 0) {
        const eventIds = activeApps.map(a => a.eventId);
        const roles = [...new Set(activeApps.map(a => a.role))];

        const conflictingSlots = await prisma.eventService.findMany({
          where: {
            eventId: { in: eventIds },
            service: { name: { in: roles } },
            startAt: { lt: slot.endAt },
            endAt: { gt: slot.startAt },
          },
          include: { service: true },
        });

        const appSet = new Set(activeApps.map(a => `${a.eventId}::${a.role}`));
        const conflict = conflictingSlots.find(s => appSet.has(`${s.eventId}::${s.service.name}`));

        if (conflict) {
          const time = new Date(conflict.startAt!).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          });
          return reply.status(400).send({
            error: `Conflito de horário: você já tem "${conflict.service.name}" agendado às ${time}`,
          });
        }
      }
    }

    // Conta aprovados e cria/atualiza a candidatura na mesma transação, pra reduzir (não
    // elimina 100%, o Postgres roda em Read Committed aqui) a janela de corrida entre duas
    // candidaturas simultâneas disputando a última vaga.
    let application;
    try {
      application = await prisma.$transaction(async (tx) => {
        const approvedCount = await tx.freelancerApplication.count({
          where: { eventId: slot.eventId, role: slot.service.name, status: 'approved' },
        });
        if (approvedCount >= slot.maxSlots) {
          throw new Error('SLOT_FULL');
        }

        return existing
          ? tx.freelancerApplication.update({
              where: { id: existing.id },
              data: { status: 'approved', appliedAt: new Date() },
            })
          : tx.freelancerApplication.create({
              data: { freelancerId: user.id, eventId: slot.eventId, role: slot.service.name, status: 'approved' },
            });
      });
    } catch (err: any) {
      if (err.message === 'SLOT_FULL') {
        return reply.status(409).send({ error: 'Esta vaga acabou de ser preenchida por outro freelancer.' });
      }
      throw err;
    }

    // Concede acesso físico assim que aprovado (fire-and-forget)
    handleAcessoGrant(application.id).catch(err => console.error(`[freelancers] Falha ao conceder acesso pra candidatura ${application.id}:`, err.message));

    return reply.status(201).send({ success: true, application });
  });

  // Get my applications
  app.get('/freelancer/applications', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    
    if (user.role !== 'freelancer') {
      return reply.status(403).send({ error: 'Freelancer access only' });
    }

    const applications = await prisma.freelancerApplication.findMany({
      where: { freelancerId: user.id, status: { not: 'cancelled' } },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            status: true,
            startAt: true,
            venues: { include: { venue: { select: { name: true, city: true } } } },
            services: {
            include: {
              service: { select: { name: true } },
              files: { select: { id: true, name: true, mimeType: true, sizeBytes: true } },
              linkedChecklists: {
                include: {
                  checklist: { include: { items: { orderBy: { order: 'asc' } } } },
                },
              },
            },
          },
            employer: { select: { name: true } },
            npsOrganizador: { select: { score: true, submittedAt: true } },
          },
        },
      },
      orderBy: { appliedAt: 'desc' },
    });

    // Enrich each application with its matching slot details
    const enriched = applications.map((app: any) => {
      const slot = app.event.services.find((s: any) => s.service.name === app.role);
      const briefing = slot ? {
        notes: slot.notes ?? null,
        files: slot.files ?? [],
        checklists: (slot.linkedChecklists ?? []).map((lc: any) => lc.checklist),
      } : null;
      return { ...app, slot: slot ?? null, briefing };
    });

    return { success: true, applications: enriched };
  });

  // Cancel an application
  app.patch('/freelancer/applications/:id/cancel', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params as { id: string };

    const application = await prisma.freelancerApplication.findFirst({
      where: { id, freelancerId: user.id },
      include: { event: { select: { startAt: true } } },
    });

    if (!application) {
      return reply.status(404).send({ error: 'Candidatura não encontrada' });
    }

    if (!['pending', 'approved'].includes(application.status)) {
      return reply.status(400).send({ error: 'Esta candidatura não pode ser cancelada' });
    }

    // Only allow cancelling up to 48h before the event starts
    if (application.event.startAt) {
      const hoursUntilEvent =
        (application.event.startAt.getTime() - Date.now()) / 3_600_000;
      if (hoursUntilEvent < 48) {
        return reply.status(400).send({
          error: 'Cancelamento permitido somente até 48h antes do evento',
        });
      }
    }

    const updated = await prisma.freelancerApplication.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    handleAcessoRevoke(id).catch(err => console.error(`[freelancers] Falha ao revogar acesso pra candidatura ${id}:`, err.message));

    return { success: true, application: updated };
  });

  // Get freelancer profile
  app.get('/freelancer/profile', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    
    if (user.role !== 'freelancer') {
      return reply.status(403).send({ error: 'Freelancer access only' });
    }

    const freelancer = await prisma.freelancer.findUnique({
      where: { id: user.id },
      select: {
        ...FREELANCER_SAFE_SELECT,
        penalties: {
          orderBy: { createdAt: 'desc' },
        },
        services: {
          include: { service: { select: { id: true, name: true } } },
        },
        _count: {
          select: {
            applications: { where: { status: 'approved' } },
          },
        },
      },
    });

    return { success: true, profile: freelancer };
  });

  // List applications for an event (employer view)
  app.get('/events/:id/applications', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { employerId: true },
    });

    if (!event) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    if (user.role !== 'admin' && event.employerId !== user.employerId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const applications = await prisma.freelancerApplication.findMany({
      where: { eventId },
      include: {
        freelancer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            strikeCount: true,
          },
        },
      },
      orderBy: { appliedAt: 'desc' },
    });

    return { success: true, applications };
  });

  // Update application status (approve/reject)
  app.patch('/applications/:id/status', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = updateApplicationSchema.parse(request.body);
    const user = (request as any).user;

    const application = await prisma.freelancerApplication.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!application) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    if (user.role !== 'admin' && application.event.employerId !== user.employerId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const updated = await prisma.freelancerApplication.update({
      where: { id },
      data: { status },
    });

    // Integração com sistema de acessos (fire-and-forget)
    if (status === 'approved') {
      handleAcessoGrant(id).catch(err => console.error(`[freelancers] Falha ao conceder acesso pra candidatura ${id}:`, err.message));
    } else if (status === 'rejected') {
      handleAcessoRevoke(id).catch(err => console.error(`[freelancers] Falha ao revogar acesso pra candidatura ${id}:`, err.message));
    }

    return { success: true, application: updated };
  });

  // --- Admin CRUD ---

  // List all freelancers (employer view)
  app.get('/freelancers', { preHandler: requireAuth }, async (request) => {
    const query = request.query as { search?: string; status?: string; page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1'));
    const limit = Math.min(200, parseInt(query.limit || '20'));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status && query.status !== 'all') where.status = query.status;
    if (query.search) {
      const cpfSearch = query.search.replace(/\D/g, '');
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        ...(cpfSearch ? [{ cpf: { contains: cpfSearch } }] : []),
        { phone: { contains: query.search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.freelancer.count({ where }),
      (prisma as any).freelancer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        select: {
          id: true, name: true, email: true, cpf: true, phone: true,
          birthDate: true, status: true, strikeCount: true,
          createdAt: true, updatedAt: true,
          services: { include: { service: true } },
          _count: { select: { penalties: true, applications: { where: { status: 'approved' } } } },
        },
      }),
    ]);

    const totalActive = await prisma.freelancer.count({ where: { status: 'active' } });
    const totalSuspended = await prisma.freelancer.count({ where: { status: 'suspended' } });

    return { success: true, freelancers: items, total, page, limit, totalActive, totalSuspended };
  });

  // Get single freelancer
  app.get('/freelancers/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const freelancer = await (prisma as any).freelancer.findUnique({
      where: { id },
      select: {
        ...FREELANCER_SAFE_SELECT,
        services: { include: { service: true } },
        penalties: { orderBy: { createdAt: 'desc' }, take: 10 },
        _count: { select: { applications: { where: { status: 'approved' } } } },
      },
    });
    if (!freelancer) return reply.status(404).send({ error: 'Freelancer não encontrado' });
    return { success: true, freelancer };
  });

  // Create freelancer (admin/employer)
  app.post('/freelancers', { preHandler: requireAuth }, async (request, reply) => {
    const { name, email, cpf, phone, birthDate, status } = request.body as {
      name: string; email: string; cpf: string; phone?: string;
      birthDate?: string; status?: string;
    };
    const cleanCpf = cpf.replace(/\D/g, '');
    const existing = await prisma.freelancer.findFirst({ where: { OR: [{ email }, { cpf: cleanCpf }] } });
    if (existing) return reply.status(400).send({ error: 'E-mail ou CPF já cadastrado' });

    const { fotoBase64 } = request.body as { fotoBase64?: string };
    const freelancer = await (prisma.freelancer.create as any)({
      data: {
        name, email, cpf: cleanCpf, phone: phone || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        status: status || 'active',
        fotoBase64: fotoBase64 || null,
      },
      select: FREELANCER_SAFE_SELECT,
    });
    return reply.status(201).send({ success: true, freelancer });
  });

  // Update freelancer
  app.patch('/freelancers/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name, email, cpf, phone, birthDate, status, fotoBase64 } = request.body as any;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (cpf !== undefined) data.cpf = cpf.replace(/\D/g, '');
    if (phone !== undefined) data.phone = phone;
    if (birthDate !== undefined) data.birthDate = birthDate ? new Date(birthDate) : null;
    if (status !== undefined) data.status = status;
    if (fotoBase64 !== undefined) data.fotoBase64 = fotoBase64 || null;
    const freelancer = await prisma.freelancer.update({ where: { id }, data, select: FREELANCER_SAFE_SELECT });
    return { success: true, freelancer };
  });

  // Delete freelancer
  app.delete('/freelancers/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const f = await prisma.freelancer.findUnique({ where: { id } });
    if (!f) return reply.status(404).send({ error: 'Freelancer não encontrado' });
    await prisma.freelancer.delete({ where: { id } });
    return { success: true };
  });

  // Apply penalty to freelancer
  app.post('/freelancers/:id/penalties', { 
    preHandler: [requireAuth, requireRole(['admin', 'event_owner'])] 
  }, async (request, reply) => {
    const { id: freelancerId } = request.params as { id: string };
    const data = penaltySchema.parse(request.body);
    const user = (request as any).user;

    const freelancer = await prisma.freelancer.findUnique({
      where: { id: freelancerId },
    });

    if (!freelancer) {
      return reply.status(404).send({ error: 'Freelancer not found' });
    }

    const penalty = await prisma.freelancerPenalty.create({
      data: {
        freelancerId,
        eventId: data.eventId,
        reason: data.reason,
        severity: data.severity,
        appliedByUserId: user.id,
      },
    });

    // Update strike count
    let strikeIncrement = 0;
    if (data.severity === 'grave') strikeIncrement = 1;
    if (data.severity === 'medium') strikeIncrement = 0.5;

    const newStrikeCount = freelancer.strikeCount + strikeIncrement;
    const newStatus = newStrikeCount >= 3 ? 'suspended' : freelancer.status;

    await prisma.freelancer.update({
      where: { id: freelancerId },
      data: {
        strikeCount: newStrikeCount,
        status: newStatus,
      },
    });

    return reply.status(201).send({ success: true, penalty });
  });
}
