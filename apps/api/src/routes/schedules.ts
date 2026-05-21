import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

const createScheduleSchema = z.object({
  name: z.string().min(1),
  scheduledAt: z.string(),
  description: z.string().optional(),
  fileId: z.string().nullable().optional(),
});

const updateScheduleSchema = createScheduleSchema.partial();

export async function scheduleRoutes(app: FastifyInstance) {
  // Get schedules for an event
  app.get('/events/:id/schedules', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };

    const schedules = await prisma.eventSchedule.findMany({
      where: { eventId },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            mimeType: true,
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    return { success: true, schedules };
  });

  // Create a schedule for an event
  app.post('/events/:id/schedules', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;
    const data = createScheduleSchema.parse(request.body);

    // Check if event exists and user has permission
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

    const schedule = await prisma.eventSchedule.create({
      data: {
        eventId,
        name: data.name,
        scheduledAt: new Date(data.scheduledAt),
        description: data.description,
        fileId: data.fileId,
      },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            mimeType: true,
          },
        },
      },
    });

    return reply.status(201).send({ success: true, schedule });
  });

  // Update a schedule
  app.patch('/schedules/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateScheduleSchema.parse(request.body);

    const schedule = await prisma.eventSchedule.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.scheduledAt && { scheduledAt: new Date(data.scheduledAt) }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.fileId !== undefined && { fileId: data.fileId }),
      },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            mimeType: true,
          },
        },
      },
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
