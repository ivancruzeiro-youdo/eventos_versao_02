import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

const createPlanSchema = z.object({
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

export async function planRoutes(app: FastifyInstance) {
  // Get event plan
  app.get('/events/:id/plan', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };

    const plan = await prisma.eventPlan.findUnique({
      where: { eventId },
      include: {
        questions: {
          include: { answers: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!plan) {
      return reply.status(404).send({ error: 'Plan not found' });
    }

    return { success: true, plan };
  });

  // Create plan
  app.post('/events/:id/plan', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const data = createPlanSchema.parse(request.body);

    // Check if plan already exists
    const existing = await prisma.eventPlan.findUnique({
      where: { eventId },
    });

    if (existing) {
      return reply.status(400).send({ error: 'Plan already exists for this event' });
    }

    const plan = await prisma.eventPlan.create({
      data: {
        eventId,
        title: data.title,
        status: 'draft',
      },
    });

    // TODO: If templateId provided, copy questions from template

    return reply.status(201).send({ success: true, plan });
  });

  // Save plan answers
  app.patch('/plans/:id/answers', { preHandler: requireAuth }, async (request, reply) => {
    const { id: planId } = request.params as { id: string };
    const { answers } = answerSchema.parse(request.body);

    const plan = await prisma.eventPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return reply.status(404).send({ error: 'Plan not found' });
    }

    // Upsert answers
    for (const answer of answers) {
      await prisma.planAnswer.upsert({
        where: {
          // Since we don't have a unique constraint on questionId, 
          // we'll delete existing and create new
          id: (await prisma.planAnswer.findFirst({
            where: { questionId: answer.questionId },
          }))?.id || 'new',
        },
        create: {
          questionId: answer.questionId,
          textValue: answer.textValue,
          selectedOptions: answer.selectedOptions || [],
        },
        update: {
          textValue: answer.textValue,
          selectedOptions: answer.selectedOptions || [],
        },
      });
    }

    return { success: true };
  });

  // Get event checklists
  app.get('/events/:id/checklists', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };

    const checklists = await prisma.eventChecklist.findMany({
      where: { eventId },
      include: {
        items: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return { success: true, checklists };
  });

  // Delete checklist
  app.delete('/checklists/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.eventChecklist.delete({
      where: { id },
    });

    return { success: true };
  });

  // Update checklist item
  app.patch('/checklist-items/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;
    const { done } = request.body as { done: boolean };

    const item = await prisma.checklistItem.update({
      where: { id },
      data: {
        done,
        doneAt: done ? new Date() : null,
        doneByUserId: done ? user.id : null,
      },
    });

    return { success: true, item };
  });

  // Apply plan template to event
  app.post('/events/:id/plan/apply-template', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const { templateId } = request.body as { templateId: string };

    // Check if plan already exists
    const existing = await prisma.eventPlan.findUnique({
      where: { eventId },
    });

    if (existing) {
      return reply.status(400).send({ error: 'Event already has a plan' });
    }

    // Get template with questions
    const template = await prisma.briefingTemplate.findUnique({
      where: { id: templateId },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    if (!template) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    // Create plan from template
    const plan = await prisma.eventPlan.create({
      data: {
        eventId,
        title: template.title,
        questions: {
          create: template.questions.map((q: any) => ({
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

    return reply.status(201).send({ success: true, plan });
  });

  // Update plan answers
  app.patch('/events/:id/plan/answers', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const { answers } = request.body as { 
      answers: { questionId: string; textValue?: string; selectedOptions?: string[] }[] 
    };

    const plan = await prisma.eventPlan.findUnique({
      where: { eventId },
      include: { questions: true },
    });

    if (!plan) {
      return reply.status(404).send({ error: 'Plan not found' });
    }

    // Process each answer
    for (const answer of answers) {
      // Delete existing answers for this question
      await prisma.planAnswer.deleteMany({
        where: { questionId: answer.questionId },
      });

      // Create new answer
      await prisma.planAnswer.create({
        data: {
          questionId: answer.questionId,
          textValue: answer.textValue || answer.selectedOptions?.join(', ') || '',
        },
      });
    }

    return { success: true };
  });
}
