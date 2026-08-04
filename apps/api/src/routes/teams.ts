import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

const createTeamSchema = z.object({
  name: z.string().min(1),
  active: z.boolean().optional(),
  serviceId: z.string().nullable().optional(),
  memberIds: z.array(z.string()).optional(),
});

const updateTeamSchema = createTeamSchema.partial();

const teamInclude = {
  service: { select: { id: true, name: true } },
  members: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } },
  _count: { select: { schedules: true } },
};

// Substitui o conjunto de membros do time pelo informado (upsert simples: remove quem
// saiu, cria quem entrou) — mais simples pra UI de checklist do que endpoints separados
// de adicionar/remover membro um a um.
async function replaceMembers(teamId: string, memberIds: string[]) {
  await prisma.$transaction([
    (prisma as any).teamMember.deleteMany({ where: { teamId, userId: { notIn: memberIds } } }),
    ...memberIds.map((userId) =>
      (prisma as any).teamMember.upsert({
        where: { teamId_userId: { teamId, userId } },
        create: { teamId, userId },
        update: {},
      })
    ),
  ]);
}

export async function teamRoutes(app: FastifyInstance) {
  // List active teams (for selection in forms)
  app.get('/teams', { preHandler: requireAuth }, async () => {
    const teams = await prisma.team.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });

    return { success: true, teams };
  });

  // List all teams (any authenticated user)
  app.get('/admin/teams', { preHandler: requireAuth }, async () => {
    const teams = await (prisma as any).team.findMany({
      orderBy: { name: 'asc' },
      include: teamInclude,
    });

    return { success: true, teams };
  });

  // Create team (any authenticated user)
  app.post('/admin/teams', { preHandler: requireAuth }, async (request, reply) => {
    const data = createTeamSchema.parse(request.body);

    const existing = await prisma.team.findUnique({ where: { name: data.name } });
    if (existing) {
      return reply.status(409).send({ error: 'Já existe um time com esse nome' });
    }

    const team = await (prisma as any).team.create({
      data: {
        name: data.name,
        active: data.active ?? true,
        serviceId: data.serviceId || null,
        ...(data.memberIds?.length ? { members: { create: data.memberIds.map((userId) => ({ userId })) } } : {}),
      },
      include: teamInclude,
    });

    return reply.status(201).send({ success: true, team });
  });

  // Update team (any authenticated user)
  app.patch('/admin/teams/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateTeamSchema.parse(request.body);

    if (data.name) {
      const existing = await prisma.team.findUnique({ where: { name: data.name } });
      if (existing && existing.id !== id) {
        return reply.status(409).send({ error: 'Já existe um time com esse nome' });
      }
    }

    if (data.memberIds !== undefined) {
      await replaceMembers(id, data.memberIds);
    }

    const team = await (prisma as any).team.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.active !== undefined && { active: data.active }),
        ...(data.serviceId !== undefined && { serviceId: data.serviceId || null }),
      },
      include: teamInclude,
    });

    return { success: true, team };
  });

  // Delete team (any authenticated user)
  app.delete('/admin/teams/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.team.delete({ where: { id } });

    return { success: true };
  });
}
