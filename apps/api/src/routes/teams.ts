import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const createTeamSchema = z.object({
  name: z.string().min(1),
  active: z.boolean().optional(),
});

const updateTeamSchema = createTeamSchema.partial();

export async function teamRoutes(app: FastifyInstance) {
  // List active teams (for selection in forms)
  app.get('/teams', { preHandler: requireAuth }, async () => {
    const teams = await prisma.team.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });

    return { success: true, teams };
  });

  // List all teams (admin)
  app.get('/admin/teams', { preHandler: [requireAuth, requireRole(['admin'])] }, async () => {
    const teams = await prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { schedules: true } } },
    });

    return { success: true, teams };
  });

  // Create team (admin)
  app.post('/admin/teams', { preHandler: [requireAuth, requireRole(['admin'])] }, async (request, reply) => {
    const data = createTeamSchema.parse(request.body);

    const existing = await prisma.team.findUnique({ where: { name: data.name } });
    if (existing) {
      return reply.status(409).send({ error: 'Já existe um time com esse nome' });
    }

    const team = await prisma.team.create({
      data: { name: data.name, active: data.active ?? true },
    });

    return reply.status(201).send({ success: true, team });
  });

  // Update team (admin)
  app.patch('/admin/teams/:id', { preHandler: [requireAuth, requireRole(['admin'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateTeamSchema.parse(request.body);

    if (data.name) {
      const existing = await prisma.team.findUnique({ where: { name: data.name } });
      if (existing && existing.id !== id) {
        return reply.status(409).send({ error: 'Já existe um time com esse nome' });
      }
    }

    const team = await prisma.team.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });

    return { success: true, team };
  });

  // Delete team (admin)
  app.delete('/admin/teams/:id', { preHandler: [requireAuth, requireRole(['admin'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.team.delete({ where: { id } });

    return { success: true };
  });
}
