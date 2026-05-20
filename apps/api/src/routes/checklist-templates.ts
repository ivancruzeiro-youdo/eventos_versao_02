import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

const createTemplateSchema = z.object({
  title: z.string().min(1),
  items: z.array(z.object({
    text: z.string().min(1),
    order: z.number(),
  })).optional(),
});

const updateTemplateSchema = z.object({
  title: z.string().min(1).optional(),
});

const addItemSchema = z.object({
  text: z.string().min(1),
  order: z.number(),
});

export async function checklistTemplateRoutes(app: FastifyInstance) {
  // List all templates
  app.get('/checklist-templates', { preHandler: requireAuth }, async (request) => {
    const user = (request as any).user;
    
    const templates = await prisma.checklistTemplate.findMany({
      where: {
        OR: [
          { employerId: null }, // Global templates
          { employerId: user.employerId }, // Employer-specific templates
        ],
      },
      include: {
        _count: {
          select: { items: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, templates };
  });

  // Get single template with items
  app.get('/checklist-templates/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const template = await prisma.checklistTemplate.findUnique({
      where: { id },
      include: {
        items: {
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
  app.post('/checklist-templates', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const data = createTemplateSchema.parse(request.body);

    const template = await prisma.checklistTemplate.create({
      data: {
        title: data.title,
        employerId: user.employerId,
        items: data.items ? {
          create: data.items.map(item => ({
            text: item.text,
            order: item.order,
          })),
        } : undefined,
      },
      include: {
        items: true,
      },
    });

    return reply.status(201).send({ success: true, template });
  });

  // Update template
  app.patch('/checklist-templates/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateTemplateSchema.parse(request.body);

    const template = await prisma.checklistTemplate.update({
      where: { id },
      data: {
        title: data.title,
      },
    });

    return { success: true, template };
  });

  // Delete template
  app.delete('/checklist-templates/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.checklistTemplate.delete({
      where: { id },
    });

    return { success: true };
  });

  // Add item to template
  app.post('/checklist-templates/:id/items', { preHandler: requireAuth }, async (request, reply) => {
    const { id: templateId } = request.params as { id: string };
    const data = addItemSchema.parse(request.body);

    const item = await prisma.checklistTemplateItem.create({
      data: {
        templateId,
        text: data.text,
        order: data.order,
      },
    });

    return reply.status(201).send({ success: true, item });
  });

  // Update item
  app.patch('/checklist-template-items/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = addItemSchema.partial().parse(request.body);

    const item = await prisma.checklistTemplateItem.update({
      where: { id },
      data,
    });

    return { success: true, item };
  });

  // Delete item
  app.delete('/checklist-template-items/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.checklistTemplateItem.delete({
      where: { id },
    });

    return { success: true };
  });

  // Reorder items
  app.post('/checklist-templates/:id/reorder', { preHandler: requireAuth }, async (request, reply) => {
    const { id: templateId } = request.params as { id: string };
    const { itemIds } = request.body as { itemIds: string[] };

    // Update order for each item
    for (let i = 0; i < itemIds.length; i++) {
      await prisma.checklistTemplateItem.update({
        where: { id: itemIds[i] },
        data: { order: i },
      });
    }

    return { success: true };
  });

  // Duplicate template
  app.post('/checklist-templates/:id/duplicate', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;

    const original = await prisma.checklistTemplate.findUnique({
      where: { id },
      include: { items: { orderBy: { order: 'asc' } } },
    });

    if (!original) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    const duplicate = await prisma.checklistTemplate.create({
      data: {
        title: `${original.title} (Cópia)`,
        employerId: user.employerId,
        items: {
          create: original.items.map(item => ({
            text: item.text,
            order: item.order,
          })),
        },
      },
      include: { items: true },
    });

    return reply.status(201).send({ success: true, template: duplicate });
  });

  // Apply template to event
  app.post('/events/:id/checklist/apply-template', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const { templateId } = request.body as { templateId: string };

    // Get template with items
    const template = await prisma.checklistTemplate.findUnique({
      where: { id: templateId },
      include: { items: { orderBy: { order: 'asc' } } },
    });

    if (!template) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    // Create checklist from template (now allows multiple checklists per event)
    const checklist = await prisma.eventChecklist.create({
      data: {
        eventId,
        title: template.title,
        templateId,
        items: {
          create: template.items.map(item => ({
            text: item.text,
            order: item.order,
          })),
        },
      },
      include: { items: true },
    });

    return reply.status(201).send({ success: true, checklist });
  });
}
