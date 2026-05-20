import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

const createTemplateSchema = z.object({
  title: z.string().min(1),
  questions: z.array(z.object({
    text: z.string().min(1),
    type: z.enum(['text', 'textarea', 'select', 'checkbox', 'multiselect', 'date', 'number']),
    required: z.boolean().default(false),
    order: z.number(),
  })).optional(),
});

const updateTemplateSchema = z.object({
  title: z.string().min(1).optional(),
});

const addQuestionSchema = z.object({
  text: z.string().min(1),
  type: z.enum(['text', 'textarea', 'select', 'checkbox', 'multiselect', 'date', 'number']),
  required: z.boolean().default(false),
  order: z.number(),
});

export async function briefingTemplateRoutes(app: FastifyInstance) {
  // List all templates
  app.get('/briefing-templates', { preHandler: requireAuth }, async (request) => {
    const user = (request as any).user;
    
    const templates = await prisma.briefingTemplate.findMany({
      where: {
        OR: [
          { employerId: null }, // Global templates
          { employerId: user.employerId }, // Employer-specific templates
        ],
      },
      include: {
        _count: {
          select: { questions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, templates };
  });

  // Get single template with questions
  app.get('/briefing-templates/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const template = await prisma.briefingTemplate.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!template) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    return { success: true, template };
  });

  // Create template
  app.post('/briefing-templates', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const data = createTemplateSchema.parse(request.body);

    const template = await prisma.briefingTemplate.create({
      data: {
        title: data.title,
        employerId: user.employerId,
        questions: data.questions ? {
          create: data.questions.map(q => ({
            text: q.text,
            type: q.type,
            required: q.required,
            order: q.order,
          })),
        } : undefined,
      },
      include: {
        questions: true,
      },
    });

    return reply.status(201).send({ success: true, template });
  });

  // Update template
  app.patch('/briefing-templates/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateTemplateSchema.parse(request.body);

    const template = await prisma.briefingTemplate.update({
      where: { id },
      data: {
        title: data.title,
      },
    });

    return { success: true, template };
  });

  // Delete template
  app.delete('/briefing-templates/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.briefingTemplate.delete({
      where: { id },
    });

    return { success: true };
  });

  // Add question to template
  app.post('/briefing-templates/:id/questions', { preHandler: requireAuth }, async (request, reply) => {
    const { id: templateId } = request.params as { id: string };
    const data = addQuestionSchema.parse(request.body);

    const question = await prisma.briefingTemplateQuestion.create({
      data: {
        templateId,
        text: data.text,
        type: data.type,
        required: data.required,
        order: data.order,
      },
    });

    return reply.status(201).send({ success: true, question });
  });

  // Update question
  app.patch('/briefing-template-questions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = addQuestionSchema.partial().parse(request.body);

    const question = await prisma.briefingTemplateQuestion.update({
      where: { id },
      data,
    });

    return { success: true, question };
  });

  // Delete question
  app.delete('/briefing-template-questions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.briefingTemplateQuestion.delete({
      where: { id },
    });

    return { success: true };
  });

  // Reorder questions
  app.post('/briefing-templates/:id/reorder', { preHandler: requireAuth }, async (request, reply) => {
    const { id: templateId } = request.params as { id: string };
    const { questionIds } = request.body as { questionIds: string[] };

    // Update order for each question
    for (let i = 0; i < questionIds.length; i++) {
      await prisma.briefingTemplateQuestion.update({
        where: { id: questionIds[i] },
        data: { order: i },
      });
    }

    return { success: true };
  });

  // Duplicate template
  app.post('/briefing-templates/:id/duplicate', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;

    const original = await prisma.briefingTemplate.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    if (!original) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    const duplicate = await prisma.briefingTemplate.create({
      data: {
        title: `${original.title} (Cópia)`,
        employerId: user.employerId,
        questions: {
          create: original.questions.map(q => ({
            text: q.text,
            type: q.type,
            required: q.required,
            order: q.order,
          })),
        },
      },
      include: { questions: true },
    });

    return reply.status(201).send({ success: true, template: duplicate });
  });
}
