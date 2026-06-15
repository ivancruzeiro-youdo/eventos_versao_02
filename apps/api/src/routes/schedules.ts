import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

const createScheduleSchema = z.object({
  name: z.string().min(1),
  teamId: z.string().min(1, 'Selecione um time'),
  startAt: z.string(),
  endAt: z.string(),
  description: z.string().optional(),
  fileId: z.string().nullable().optional(),
});

const updateScheduleSchema = createScheduleSchema.partial();

const scheduleInclude = {
  team: { select: { id: true, name: true } },
  file: {
    select: {
      id: true,
      name: true,
      mimeType: true,
    },
  },
};

// Find an existing activity of the same team whose time range overlaps [startAt, endAt).
async function findTeamConflict(params: {
  eventId: string;
  teamId: string;
  startAt: Date;
  endAt: Date;
  excludeId?: string;
}) {
  const { eventId, teamId, startAt, endAt, excludeId } = params;
  return prisma.eventSchedule.findFirst({
    where: {
      eventId,
      teamId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      // overlap: existing.startAt < new.endAt AND existing.endAt > new.startAt
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true, name: true, startAt: true, endAt: true },
  });
}

export async function scheduleRoutes(app: FastifyInstance) {
  // Get schedules for an event
  app.get('/events/:id/schedules', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };

    const schedules = await prisma.eventSchedule.findMany({
      where: { eventId },
      include: scheduleInclude,
      orderBy: { startAt: 'asc' },
    });

    return { success: true, schedules };
  });

  // Create a schedule for an event
  app.post('/events/:id/schedules', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const data = createScheduleSchema.parse(request.body);

    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);

    if (endAt <= startAt) {
      return reply.status(400).send({ error: 'A data/hora de fim deve ser posterior à de início' });
    }

    const conflict = await findTeamConflict({ eventId, teamId: data.teamId, startAt, endAt });
    if (conflict) {
      return reply.status(409).send({
        error: `Conflito de horário: o time já possui a atividade "${conflict.name}" nesse período`,
        conflict,
      });
    }

    const schedule = await prisma.eventSchedule.create({
      data: {
        eventId,
        teamId: data.teamId,
        name: data.name,
        startAt,
        endAt,
        description: data.description,
        fileId: data.fileId,
      },
      include: scheduleInclude,
    });

    return reply.status(201).send({ success: true, schedule });
  });

  // Update a schedule
  app.patch('/schedules/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateScheduleSchema.parse(request.body);

    const current = await prisma.eventSchedule.findUnique({ where: { id } });
    if (!current) {
      return reply.status(404).send({ error: 'Atividade não encontrada' });
    }

    const startAt = data.startAt ? new Date(data.startAt) : current.startAt;
    const endAt = data.endAt ? new Date(data.endAt) : current.endAt;
    const teamId = data.teamId ?? current.teamId;

    if (endAt <= startAt) {
      return reply.status(400).send({ error: 'A data/hora de fim deve ser posterior à de início' });
    }

    if (teamId) {
      const conflict = await findTeamConflict({
        eventId: current.eventId,
        teamId,
        startAt,
        endAt,
        excludeId: id,
      });
      if (conflict) {
        return reply.status(409).send({
          error: `Conflito de horário: o time já possui a atividade "${conflict.name}" nesse período`,
          conflict,
        });
      }
    }

    const schedule = await prisma.eventSchedule.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.teamId && { teamId: data.teamId }),
        ...(data.startAt && { startAt }),
        ...(data.endAt && { endAt }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.fileId !== undefined && { fileId: data.fileId }),
      },
      include: scheduleInclude,
    });

    return { success: true, schedule };
  });

  // Delete a schedule
  app.delete('/schedules/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.eventSchedule.delete({
      where: { id },
    });

    return { success: true };
  });
}
