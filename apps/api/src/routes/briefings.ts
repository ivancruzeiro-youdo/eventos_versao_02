import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

const createBriefingSchema = z.object({
  title: z.string().min(1),
  templateId: z.string().optional(),
});

const answerSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    textValue: z.string().optional(),
    selectedOptions: z.array(z.string()).optional(),
  })),
});

export async function briefingRoutes(app: FastifyInstance) {
  // Get event briefing
  app.get('/events/:id/briefing', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };

    const briefing = await prisma.briefing.findUnique({
      where: { eventId },
      include: {
        questions: {
          include: { answers: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!briefing) {
      return reply.status(404).send({ error: 'Briefing not found' });
    }

    return { success: true, briefing };
  });

  // Create briefing from template
  app.post('/events/:id/briefing', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const data = createBriefingSchema.parse(request.body);

    // Check if briefing already exists
    const existing = await prisma.briefing.findUnique({
      where: { eventId },
    });

    if (existing) {
      return reply.status(400).send({ error: 'Briefing already exists for this event' });
    }

    let questions: any[] = [];

    // If templateId provided, copy questions from template
    if (data.templateId) {
      const template = await prisma.briefingTemplate.findUnique({
        where: { id: data.templateId },
        include: { questions: { orderBy: { order: 'asc' } } },
      });

      if (template) {
        questions = template.questions;
      }
    }

    const briefing = await prisma.briefing.create({
      data: {
        eventId,
        templateId: data.templateId,
        status: 'draft',
        questions: {
          create: questions.map((q: any) => ({
            text: q.text,
            type: q.type,
            required: q.required,
            order: q.order,
          })),
        },
      },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return reply.status(201).send({ success: true, briefing });
  });

  // Update briefing answers
  app.patch('/events/:id/briefing/answers', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;
    const data = answerSchema.parse(request.body);

    const briefing = await prisma.briefing.findUnique({
      where: { eventId },
      include: { questions: true },
    });

    if (!briefing) {
      return reply.status(404).send({ error: 'Briefing not found' });
    }

    // Process each answer
    for (const answer of data.answers) {
      const question = briefing.questions.find((q: any) => q.id === answer.questionId);
      if (!question) continue;

      // Delete existing answer for this question
      await prisma.briefingAnswer.deleteMany({
        where: {
          questionId: answer.questionId,
        },
      });

      // Create new answer
      await prisma.briefingAnswer.create({
        data: {
          questionId: answer.questionId,
          value: answer.textValue || answer.selectedOptions?.join(', ') || '',
        },
      });
    }

    return { success: true };
  });

  // Apply briefing template to event
  app.post('/events/:id/briefing/apply-template', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const { templateId } = request.body as { templateId: string };

    // Check if briefing already exists
    const existing = await prisma.briefing.findUnique({
      where: { eventId },
    });

    if (existing) {
      return reply.status(400).send({ error: 'Event already has a briefing' });
    }

    // Get template
    const template = await prisma.briefingTemplate.findUnique({
      where: { id: templateId },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    if (!template) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    // Create briefing from template
    const briefing = await prisma.briefing.create({
      data: {
        eventId,
        templateId,
        status: 'draft',
        questions: {
          create: template.questions.map((q) => ({
            text: q.text,
            type: q.type,
            required: q.required,
            order: q.order,
          })),
        },
      },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return reply.status(201).send({ success: true, briefing });
  });
}
