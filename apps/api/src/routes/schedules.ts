import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

const createScheduleSchema = z.object({
  name: z.string().min(1),
  teamId: z.string().min(1, 'Selecione um time'),
  startAt: z.string(),
  endAt: z.string(),
  description: z.string().nullable().optional(),
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

function fmtDateTime(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

function fmtTime(d: Date): string {
  return d.toLocaleString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

async function addScheduleHistory(params: {
  eventId: string;
  scheduleId: string;
  userId: string | null;
  content: string;
}) {
  await (prisma as any).eventComment.create({
    data: {
      eventId: params.eventId,
      eventScheduleId: params.scheduleId,
      userId: params.userId,
      isSystem: true,
      content: params.content,
    },
  });
}

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

  // Get history for a schedule
  app.get('/schedules/:id/history', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const history = await (prisma as any).eventComment.findMany({
      where: { eventScheduleId: id, isSystem: true },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return { success: true, history };
  });

  // Create a schedule for an event
  app.post('/events/:id/schedules', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const data = createScheduleSchema.parse(request.body);
    const userId = (request.user as any)?.sub ?? null;

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
      include: { ...scheduleInclude, team: { select: { id: true, name: true } } },
    });

    await addScheduleHistory({
      eventId,
      scheduleId: schedule.id,
      userId,
      content: `Atividade criada: "${schedule.name}" · ${fmtDateTime(startAt)}–${fmtTime(endAt)}${schedule.team ? ` · Time: ${schedule.team.name}` : ''}`,
    });

    return reply.status(201).send({ success: true, schedule });
  });

  // Update a schedule
  app.patch('/schedules/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateScheduleSchema.parse(request.body);
    const userId = (request.user as any)?.sub ?? null;

    const current = await prisma.eventSchedule.findUnique({
      where: { id },
      include: { team: { select: { id: true, name: true } } },
    });
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

    // Build diff description
    const changes: string[] = [];
    if (data.name && data.name !== current.name) changes.push(`nome: "${current.name}" → "${data.name}"`);
    if (data.startAt && startAt.getTime() !== current.startAt.getTime()) changes.push(`início: ${fmtDateTime(current.startAt)} → ${fmtDateTime(startAt)}`);
    if (data.endAt && endAt.getTime() !== current.endAt.getTime()) changes.push(`fim: ${fmtTime(current.endAt)} → ${fmtTime(endAt)}`);
    if (data.teamId && data.teamId !== current.teamId) changes.push(`time alterado`);
    if (data.description !== undefined && data.description !== current.description) changes.push(`descrição atualizada`);

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

    const changeSummary = changes.length > 0 ? changes.join('; ') : 'sem alterações detectadas';
    await addScheduleHistory({
      eventId: current.eventId,
      scheduleId: id,
      userId,
      content: `Atividade editada: "${schedule.name}" · ${changeSummary}`,
    });

    return { success: true, schedule };
  });

  // Delete a schedule
  app.delete('/schedules/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request.user as any)?.sub ?? null;

    const current = await prisma.eventSchedule.findUnique({
      where: { id },
      include: { team: { select: { id: true, name: true } } },
    });
    if (!current) {
      return reply.status(404).send({ error: 'Atividade não encontrada' });
    }

    // Register history BEFORE delete (FK will become null after delete via SET NULL)
    await addScheduleHistory({
      eventId: current.eventId,
      scheduleId: id,
      userId,
      content: `Atividade removida: "${current.name}" · ${fmtDateTime(current.startAt)}–${fmtTime(current.endAt)}${current.team ? ` · Time: ${current.team.name}` : ''}`,
    });

    await prisma.eventSchedule.delete({ where: { id } });

    return { success: true };
  });
}
