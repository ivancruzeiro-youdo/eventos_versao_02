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

// Tenant isolation, same pattern as guests.ts/events.ts/schedules.ts/layout.ts.
// Freelancer-derived sessions (no employerId concept) are exempt.
async function checkEventAccess(user: any, eventId: string): Promise<boolean> {
  if (user.role === 'admin' || user.employerId === undefined) return true;
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { employerId: true } });
  return !!event && event.employerId === user.employerId;
}

export async function planRoutes(app: FastifyInstance) {
  // Get event plan
  app.get('/events/:id/plan', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

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
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });
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
    const user = (request as any).user;
    const { answers } = answerSchema.parse(request.body);

    const plan = await prisma.eventPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return reply.status(404).send({ error: 'Plan not found' });
    }
    if (!(await checkEventAccess(user, plan.eventId))) return reply.status(403).send({ error: 'Access denied' });

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
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

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
    const user = (request as any).user;

    const checklist = await prisma.eventChecklist.findUnique({ where: { id }, select: { eventId: true } });
    if (!checklist) return reply.status(404).send({ error: 'Checklist não encontrado' });
    if (!(await checkEventAccess(user, checklist.eventId))) return reply.status(403).send({ error: 'Access denied' });

    await prisma.eventChecklist.delete({
      where: { id },
    });

    return { success: true };
  });

  // Add item to an event checklist
  app.post('/checklists/:id/items', { preHandler: requireAuth }, async (request, reply) => {
    const { id: checklistId } = request.params as { id: string };
    const user = (request as any).user;
    const { text } = request.body as { text?: string };

    if (!text || !text.trim()) {
      return reply.status(400).send({ error: 'Texto do item é obrigatório' });
    }

    const checklist = await prisma.eventChecklist.findUnique({ where: { id: checklistId }, select: { eventId: true } });
    if (!checklist) return reply.status(404).send({ error: 'Checklist não encontrado' });
    if (!(await checkEventAccess(user, checklist.eventId))) return reply.status(403).send({ error: 'Access denied' });

    const last = await prisma.checklistItem.findFirst({
      where: { checklistId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const item = await prisma.checklistItem.create({
      data: {
        checklistId,
        text: text.trim(),
        order: (last?.order ?? -1) + 1,
      },
    });

    return reply.status(201).send({ success: true, item });
  });

  // Update checklist item (toggle done and/or edit text)
  app.patch('/checklist-items/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;
    const { done, text } = request.body as { done?: boolean; text?: string };

    const existingItem = await prisma.checklistItem.findUnique({ where: { id }, select: { checklist: { select: { eventId: true } } } });
    if (!existingItem?.checklist) return reply.status(404).send({ error: 'Item não encontrado' });
    if (!(await checkEventAccess(user, existingItem.checklist.eventId))) return reply.status(403).send({ error: 'Access denied' });

    const item = await prisma.checklistItem.update({
      where: { id },
      data: {
        ...(typeof done === 'boolean'
          ? {
              done,
              doneAt: done ? new Date() : null,
              doneByUserId: done ? user.id : null,
            }
          : {}),
        ...(typeof text === 'string' && text.trim() ? { text: text.trim() } : {}),
      },
    });

    return { success: true, item };
  });

  // Reorder items within a checklist
  app.patch('/checklists/:id/reorder', { preHandler: requireAuth }, async (request, reply) => {
    const { id: checklistId } = request.params as { id: string };
    const user = (request as any).user;
    const { items } = request.body as { items: { id: string; order: number }[] };

    const checklist = await prisma.eventChecklist.findUnique({ where: { id: checklistId }, select: { eventId: true } });
    if (!checklist) return reply.status(404).send({ error: 'Checklist não encontrado' });
    if (!(await checkEventAccess(user, checklist.eventId))) return reply.status(403).send({ error: 'Access denied' });

    await Promise.all(
      items.map(({ id, order }) =>
        prisma.checklistItem.update({ where: { id }, data: { order } })
      )
    );
    return { success: true };
  });

  // Delete a single checklist item
  app.delete('/checklist-items/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;

    const existingItem = await prisma.checklistItem.findUnique({ where: { id }, select: { checklist: { select: { eventId: true } } } });
    if (!existingItem?.checklist) return reply.status(404).send({ error: 'Item não encontrado' });
    if (!(await checkEventAccess(user, existingItem.checklist.eventId))) return reply.status(403).send({ error: 'Access denied' });

    await prisma.checklistItem.delete({ where: { id } });

    return { success: true };
  });

  // Apply plan template to event
  app.post('/events/:id/plan/apply-template', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });
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
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });
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

  // ── Plan Template CRUD ──────────────────────────────────────────────────────

  app.get('/plan-templates', { preHandler: requireAuth }, async () => {
    const templates = await prisma.planTemplate.findMany({
      include: { questions: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, templates };
  });

  app.post('/plan-templates', { preHandler: requireAuth }, async (request, reply) => {
    const { title, description } = request.body as { title: string; description?: string };
    if (!title?.trim()) return reply.status(400).send({ error: 'Título obrigatório' });
    const template = await prisma.planTemplate.create({
      data: { title: title.trim(), description: description?.trim() || null },
      include: { questions: true },
    });
    return reply.status(201).send({ success: true, template });
  });

  app.delete('/plan-templates/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.planTemplate.delete({ where: { id } });
    return { success: true };
  });

  app.post('/plan-templates/:id/questions', { preHandler: requireAuth }, async (request, reply) => {
    const { id: templateId } = request.params as { id: string };
    const { text, type, required, category, options } = request.body as {
      text: string; type: string; required?: boolean; category?: string; options?: string[];
    };
    if (!text?.trim()) return reply.status(400).send({ error: 'Texto obrigatório' });

    const last = await prisma.planTemplateQuestion.findFirst({
      where: { templateId }, orderBy: { order: 'desc' },
    });

    const question = await prisma.planTemplateQuestion.create({
      data: {
        templateId,
        text: text.trim(),
        type: type as any,
        required: required ?? false,
        category: category?.trim() || null,
        options: options ?? null,
        order: (last?.order ?? -1) + 1,
      },
    });
    return reply.status(201).send({ success: true, question });
  });

  app.delete('/plan-templates/:id/questions/:qid', { preHandler: requireAuth }, async (request, reply) => {
    const { qid } = request.params as { id: string; qid: string };
    await prisma.planTemplateQuestion.delete({ where: { id: qid } });
    return { success: true };
  });
}
