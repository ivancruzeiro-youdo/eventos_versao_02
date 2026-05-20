import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const questionSchema = z.object({
  text: z.string().min(1),
  type: z.enum(['text', 'textarea', 'select', 'multiselect', 'checkbox', 'date', 'number']),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  order: z.number().int().default(0),
});

const createTemplateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  questions: z.array(questionSchema).default([]),
});

const updateTemplateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
});

export async function planTemplateRoutes(app: FastifyInstance) {
  // ── Admin-only routes ──────────────────────────────────────────────────────
  const adminHandlers = [requireAuth, requireRole(['admin'])];

  // List all templates
  app.get('/admin/plan-templates', { preHandler: adminHandlers }, async (request, reply) => {
    const templates = await prisma.planTemplate.findMany({
      include: {
        _count: { select: { questions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, templates };
  });

  // Get single template with questions
  app.get('/admin/plan-templates/:id', { preHandler: adminHandlers }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const template = await prisma.planTemplate.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { order: 'asc' } },
      },
    });

    if (!template) {
      return reply.status(404).send({ error: 'Template não encontrado' });
    }
    return { success: true, template };
  });

  // Create template
  app.post('/admin/plan-templates', { preHandler: adminHandlers }, async (request, reply) => {
    const data = createTemplateSchema.parse(request.body);

    const template = await prisma.planTemplate.create({
      data: {
        title: data.title,
        description: data.description,
        questions: {
          create: data.questions.map((q, i) => ({
            text: q.text,
            type: q.type,
            required: q.required,
            options: q.options ?? null,
            order: q.order ?? i,
          })),
        },
      },
      include: {
        questions: { orderBy: { order: 'asc' } },
      },
    });

    return reply.status(201).send({ success: true, template });
  });

  // Update template metadata
  app.patch('/admin/plan-templates/:id', { preHandler: adminHandlers }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateTemplateSchema.parse(request.body);

    const template = await prisma.planTemplate.update({
      where: { id },
      data,
      include: {
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { questions: true } },
      },
    });
    return { success: true, template };
  });

  // Delete template
  app.delete('/admin/plan-templates/:id', { preHandler: adminHandlers }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.planTemplate.delete({ where: { id } });
    return { success: true };
  });

  // Add question to template
  app.post('/admin/plan-templates/:id/questions', { preHandler: adminHandlers }, async (request, reply) => {
    const { id: templateId } = request.params as { id: string };
    const data = questionSchema.parse(request.body);

    // Count existing questions to set order
    const count = await prisma.planTemplateQuestion.count({ where: { templateId } });

    const question = await prisma.planTemplateQuestion.create({
      data: {
        templateId,
        text: data.text,
        type: data.type,
        required: data.required,
        options: data.options ?? null,
        order: data.order ?? count,
      },
    });
    return reply.status(201).send({ success: true, question });
  });

  // Update question
  app.patch('/admin/plan-template-questions/:id', { preHandler: adminHandlers }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = questionSchema.partial().parse(request.body);

    const question = await prisma.planTemplateQuestion.update({
      where: { id },
      data: {
        ...(data.text !== undefined && { text: data.text }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.required !== undefined && { required: data.required }),
        ...(data.options !== undefined && { options: data.options }),
        ...(data.order !== undefined && { order: data.order }),
      },
    });
    return { success: true, question };
  });

  // Delete question
  app.delete('/admin/plan-template-questions/:id', { preHandler: adminHandlers }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.planTemplateQuestion.delete({ where: { id } });
    return { success: true };
  });

  // ── Event plan template routes (auth only, not admin-only) ─────────────────

  // List templates for selection when creating a plan (operators, owners, admins)
  app.get('/plan-templates', { preHandler: requireAuth }, async (request, reply) => {
    const templates = await prisma.planTemplate.findMany({
      include: {
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { questions: true } },
      },
      orderBy: { title: 'asc' },
    });
    return { success: true, templates };
  });
}
