import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

const createCommentSchema = z.object({
  content: z.string().min(1),
});

export async function commentRoutes(app: FastifyInstance) {
  // Get comments for an event
  app.get('/events/:id/comments', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };

    const comments = await prisma.eventComment.findMany({
      where: { eventId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return { success: true, comments };
  });

  // Create a comment for an event
  app.post('/events/:id/comments', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const data = createCommentSchema.parse(request.body);
    const user = (request as any).user;

    const comment = await prisma.eventComment.create({
      data: {
        eventId,
        userId: user.id,
        content: data.content,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return reply.status(201).send({ success: true, comment });
  });

  // Update a comment
  app.patch('/comments/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = createCommentSchema.partial().parse(request.body);
    const user = (request as any).user;

    // Check if comment belongs to user
    const existing = await prisma.eventComment.findUnique({
      where: { id },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Comment not found' });
    }

    if (existing.userId !== user.id && user.role !== 'admin') {
      return reply.status(403).send({ error: 'Not authorized to edit this comment' });
    }

    const comment = await prisma.eventComment.update({
      where: { id },
      data: { content: data.content },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return { success: true, comment };
  });

  // Delete a comment
  app.delete('/comments/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;

    // Check if comment belongs to user
    const existing = await prisma.eventComment.findUnique({
      where: { id },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Comment not found' });
    }

    if (existing.userId !== user.id && user.role !== 'admin') {
      return reply.status(403).send({ error: 'Not authorized to delete this comment' });
    }

    await prisma.eventComment.delete({
      where: { id },
    });

    return { success: true };
  });
}
