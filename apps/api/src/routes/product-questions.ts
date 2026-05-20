import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

const questionSchema = z.object({
  text: z.string().min(1),
  type: z.enum(['text', 'textarea', 'select', 'multiselect', 'checkbox', 'date', 'number']),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional().nullable(),
  order: z.number().int().default(0),
});

export async function productQuestionRoutes(app: FastifyInstance) {
  // GET /products/:id/questions — list questions for a product
  app.get('/products/:id/questions', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const product = await (prisma as any).product.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    if (!product) return reply.status(404).send({ error: 'Produto não encontrado' });

    return { success: true, product: { id: product.id, name: product.name, categoryName: product.categoryName, subitems: product.subitems }, questions: product.questions };
  });

  // POST /products/:id/questions — create a question
  app.post('/products/:id/questions', { preHandler: requireAuth }, async (request, reply) => {
    const { id: productId } = request.params as { id: string };
    const data = questionSchema.parse(request.body);

    const question = await (prisma as any).productQuestion.create({
      data: { productId, ...data, options: data.options ?? undefined },
    });

    return reply.status(201).send({ success: true, question });
  });

  // PUT /products/:id/questions — bulk replace all questions
  app.put('/products/:id/questions', { preHandler: requireAuth }, async (request, reply) => {
    const { id: productId } = request.params as { id: string };
    const { questions } = request.body as { questions: z.infer<typeof questionSchema>[] };

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return reply.status(404).send({ error: 'Produto não encontrado' });

    // Delete existing and recreate
    await (prisma as any).productQuestion.deleteMany({ where: { productId } });

    const created = await prisma.$transaction(
      questions.map((q, i) =>
        (prisma as any).productQuestion.create({
          data: { productId, text: q.text, type: q.type, required: q.required ?? false, options: q.options ?? undefined, order: i + 1 },
        })
      )
    );

    return { success: true, questions: created };
  });

  // PATCH /product-questions/:id — update a single question
  app.patch('/product-questions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = questionSchema.partial().parse(request.body);

    const question = await (prisma as any).productQuestion.update({
      where: { id },
      data: { ...data, options: data.options ?? undefined },
    });

    return { success: true, question };
  });

  // DELETE /product-questions/:id — delete a single question
  app.delete('/product-questions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await (prisma as any).productQuestion.delete({ where: { id } });
    return { success: true };
  });
}
