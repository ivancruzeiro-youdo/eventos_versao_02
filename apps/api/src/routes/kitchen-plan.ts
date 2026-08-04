import type { FastifyInstance } from 'fastify';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';
import { getConfig, setConfig, getOpenAI } from '../lib/openai.js';

function getEmployerId(user: any): string | undefined {
  return user.employerId;
}

// ─── AI Prompt builder ────────────────────────────────────────────────────────

async function buildPlanningContext(employerId: string, windowDays: number) {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowDays * 86400000);

  // Upcoming events with their kitchen menus
  const events = await prisma.event.findMany({
    where: {
      employerId,
      status: { in: ['confirmed', 'in_progress', 'draft'] },
      startAt: { gte: now, lte: windowEnd },
    },
    include: {
      kitchenMenus: {
        include: {
          recipe: {
            include: {
              ingredients: { include: { ingredient: true } },
              subRecipes: { include: { subRecipe: true } },
            },
          },
        },
      },
      _count: { select: { guests: true } },
    },
    orderBy: { startAt: 'asc' },
  });

  // All recipes needed across these events
  const recipeIds = new Set<string>();
  for (const ev of events) {
    for (const menu of ev.kitchenMenus) recipeIds.add(menu.recipeId);
  }

  // All ingredients to check stock
  const ingredients = await (prisma as any).kitchenIngredient.findMany({
    where: { employerId },
    select: { id: true, name: true, unit: true, stockQuantity: true, costPerUnit: true },
  });

  // Format events for prompt
  const eventsCtx = events.map((ev: any) => ({
    id: ev.id,
    name: ev.name,
    date: ev.startAt?.toISOString().slice(0, 10),
    guestCount: ev._count.guests,
    menu: ev.kitchenMenus.map((m: any) => ({
      recipeId: m.recipe.id,
      recipeName: m.recipe.name,
      recipeType: m.recipe.recipeType,
      servingsNeeded: m.servingsNeeded || ev._count.guests,
      prepTimeMinutes: m.recipe.prepTime,
      validityHours: m.recipe.validityHours,
      estimatedCostPerServing: m.recipe.ingredients.reduce((sum: number, ri: any) => {
        return sum + ri.quantity * (ri.ingredient.costPerUnit || 0);
      }, 0) / Math.max(m.recipe.servings, 1),
      subRecipes: m.recipe.subRecipes.map((sr: any) => ({
        id: sr.subRecipe.id,
        name: sr.subRecipe.name,
        servingsUsed: sr.servingsUsed,
        prepTime: sr.subRecipe.prepTime,
        validityHours: sr.subRecipe.validityHours,
      })),
      ingredients: m.recipe.ingredients.map((ri: any) => ({
        id: ri.ingredientId,
        name: ri.ingredient.name,
        quantity: ri.quantity,
        unit: ri.unit,
      })),
    })),
  }));

  const stockCtx = ingredients.map((ing: any) => ({
    id: ing.id,
    name: ing.name,
    unit: ing.unit,
    stock: ing.stockQuantity,
    costPerUnit: ing.costPerUnit,
  }));

  return { eventsCtx, stockCtx, events };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function kitchenPlanRoutes(app: FastifyInstance) {

  // ── Config ───────────────────────────────────────────────────────────────────

  app.get('/kitchen/config', { preHandler: requireAuth }, async (request) => {
    const apiKey = await getConfig('openai_api_key');
    const model = await getConfig('openai_model') || 'gpt-4o';
    const windowDays = await getConfig('kitchen_plan_window_days') || '30';
    return {
      hasApiKey: !!apiKey,
      apiKeyMasked: apiKey ? `sk-...${apiKey.slice(-4)}` : null,
      model,
      windowDays: parseInt(windowDays),
    };
  });

  app.post('/kitchen/config', { preHandler: requireAuth }, async (request, reply) => {
    const { apiKey, model, windowDays } = request.body as any;
    if (apiKey) await setConfig('openai_api_key', apiKey);
    if (model) await setConfig('openai_model', model);
    if (windowDays) await setConfig('kitchen_plan_window_days', String(windowDays));
    return { success: true };
  });

  app.delete('/kitchen/config/openai-key', { preHandler: requireAuth }, async () => {
    await (prisma as any).uerpConfig.deleteMany({ where: { key: 'openai_api_key' } });
    return { success: true };
  });

  // ── Plans ────────────────────────────────────────────────────────────────────

  // GET /kitchen/production-plan — latest plan for employer
  app.get('/kitchen/production-plan', { preHandler: requireAuth }, async (request) => {
    const user = (request as any).user;
    const employerId = getEmployerId(user);

    const plan = await (prisma as any).kitchenProductionPlan.findFirst({
      where: employerId ? { employerId } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          orderBy: { scheduledDate: 'asc' },
          include: {
            recipe: { select: { id: true, name: true, recipeType: true, prepTime: true, validityHours: true } },
            allocations: {
              include: {
                event: { select: { id: true, name: true, startAt: true } },
              },
            },
          },
        },
      },
    });

    return { plan: plan || null };
  });

  // POST /kitchen/production-plan/generate — call AI and create plan
  app.post('/kitchen/production-plan/generate', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const employerId = getEmployerId(user);
    if (!employerId) return reply.status(400).send({ error: 'employerId required' });

    const { windowDays: reqWindow } = request.body as any;
    const cfgWindow = await getConfig('kitchen_plan_window_days');
    const windowDays = reqWindow || parseInt(cfgWindow || '30');

    const openai = await getOpenAI();
    if (!openai) {
      return reply.status(400).send({ error: 'OpenAI não configurado. Acesse Cozinha → Configurações para inserir a chave de API.' });
    }

    const model = await getConfig('openai_model') || 'gpt-4o';

    const { eventsCtx, stockCtx, events } = await buildPlanningContext(employerId, windowDays);

    if (eventsCtx.length === 0) {
      return reply.status(400).send({ error: 'Nenhum evento com menu configurado nos próximos ' + windowDays + ' dias.' });
    }

    const today = new Date().toISOString().slice(0, 10);

    const prompt = `Você é um planejador de produção de cozinha para uma empresa de eventos (catering).
Gere um plano de produção detalhado e inteligente em JSON.

Data de hoje: ${today}
Janela de planejamento: próximos ${windowDays} dias

## Eventos confirmados com cardápio:
${JSON.stringify(eventsCtx, null, 2)}

## Estoque atual de ingredientes:
${JSON.stringify(stockCtx, null, 2)}

## Regras do plano de produção:
1. Pré-preparo (bases, massas, molhos) deve ocorrer 1-3 dias antes do evento
2. Produção do dia (itens finais) deve ocorrer na manhã do dia do evento
3. Respeite a validade pós-produção (validityHours): não produza cedo demais
4. Se vários eventos próximos precisam da mesma receita base, unifique em um único lote
5. Calcule quantidade = soma das porções necessárias + 10% de buffer
6. Calcule o custo estimado com base nos ingredientes
7. Calcule déficit de estoque: quantidade de cada ingrediente necessária vs disponível
8. Sub-receitas (bases) devem aparecer como itens separados de pré-preparo
9. Priorize eficiência: agrupe produções no mesmo dia quando possível

Retorne APENAS JSON válido neste formato exato:
{
  "notes": "Resumo geral do plano (2-3 frases)",
  "items": [
    {
      "recipeId": "uuid-da-receita",
      "recipeName": "nome para referência",
      "quantity": 120,
      "scheduledDate": "YYYY-MM-DD",
      "phase": "pre_prep",
      "validityHours": 48,
      "estimatedCost": 150.00,
      "reasoning": "Explicação curta do porquê desta data e quantidade",
      "eventAllocations": [
        { "eventId": "uuid", "eventName": "nome do evento", "quantity": 60, "costShare": 75.00 }
      ]
    }
  ],
  "stockDeficits": [
    { "ingredientId": "uuid", "ingredientName": "nome", "unit": "kg", "needed": 5.0, "have": 2.0, "deficit": 3.0 }
  ]
}`;

    let aiResponse: any;
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 4000,
        temperature: 0.3,
      });
      const raw = completion.choices[0]?.message?.content || '{}';
      aiResponse = JSON.parse(raw);
    } catch (err: any) {
      return reply.status(500).send({ error: 'Erro ao chamar OpenAI: ' + err.message });
    }

    // Validate and save plan
    const items: any[] = aiResponse.items || [];
    if (items.length === 0) {
      return reply.status(500).send({ error: 'A IA não retornou itens de produção.' });
    }

    // Create the plan record
    const plan = await (prisma as any).kitchenProductionPlan.create({
      data: {
        employerId,
        status: 'draft',
        windowDays,
        aiModel: model,
        aiNotes: aiResponse.notes || null,
        items: {
          create: items.map((item: any) => ({
            recipeId: item.recipeId,
            quantity: item.quantity || 1,
            scheduledDate: new Date(item.scheduledDate),
            phase: item.phase || 'pre_prep',
            estimatedCost: item.estimatedCost || 0,
            validityHours: item.validityHours || 48,
            reasoning: item.reasoning || null,
            status: 'pending',
            allocations: item.eventAllocations?.length > 0 ? {
              create: item.eventAllocations.map((alloc: any) => ({
                eventId: alloc.eventId,
                quantity: alloc.quantity || 0,
                costShare: alloc.costShare || 0,
              })),
            } : undefined,
          })),
        },
      },
      include: {
        items: {
          orderBy: { scheduledDate: 'asc' },
          include: {
            recipe: { select: { id: true, name: true, recipeType: true, prepTime: true, validityHours: true } },
            allocations: {
              include: { event: { select: { id: true, name: true, startAt: true } } },
            },
          },
        },
      },
    });

    return { plan, stockDeficits: aiResponse.stockDeficits || [] };
  });

  // PATCH /kitchen/production-plan/:id — update plan status or notes
  app.patch('/kitchen/production-plan/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, aiNotes } = request.body as any;
    const updated = await (prisma as any).kitchenProductionPlan.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(aiNotes !== undefined ? { aiNotes } : {}),
      },
    });
    return { success: true, plan: updated };
  });

  // DELETE /kitchen/production-plan/:id — delete a plan
  app.delete('/kitchen/production-plan/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    await (prisma as any).kitchenProductionPlan.delete({ where: { id } });
    return { success: true };
  });

  // ── Plan Items ────────────────────────────────────────────────────────────────

  // PATCH /kitchen/production-plan/items/:id — adjust item (date, qty, notes)
  app.patch('/kitchen/production-plan/items/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { quantity, scheduledDate, phase, status, notes, estimatedCost } = request.body as any;
    const data: any = {};
    if (quantity !== undefined) data.quantity = quantity;
    if (scheduledDate) data.scheduledDate = new Date(scheduledDate);
    if (phase) data.phase = phase;
    if (status) data.status = status;
    if (notes !== undefined) data.notes = notes;
    if (estimatedCost !== undefined) data.estimatedCost = estimatedCost;
    const updated = await (prisma as any).kitchenProductionPlanItem.update({
      where: { id },
      data,
      include: {
        recipe: { select: { id: true, name: true, recipeType: true } },
        allocations: { include: { event: { select: { id: true, name: true, startAt: true } } } },
      },
    });
    return { success: true, item: updated };
  });

  // DELETE /kitchen/production-plan/items/:id — remove item from plan
  app.delete('/kitchen/production-plan/items/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    await (prisma as any).kitchenProductionPlanItem.delete({ where: { id } });
    return { success: true };
  });

  // ── Stock check ───────────────────────────────────────────────────────────────

  // GET /kitchen/production-plan/:id/stock-check
  app.get('/kitchen/production-plan/:id/stock-check', { preHandler: requireAuth }, async (request, reply) => {
    const { id: planId } = request.params as { id: string };
    const user = (request as any).user;
    const employerId = getEmployerId(user);

    const plan = await (prisma as any).kitchenProductionPlan.findUnique({
      where: { id: planId },
      include: {
        items: {
          include: {
            recipe: {
              include: {
                ingredients: { include: { ingredient: true } },
                subRecipes: {
                  include: {
                    subRecipe: { include: { ingredients: { include: { ingredient: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!plan) return reply.status(404).send({ error: 'Plan not found' });

    // Accumulate ingredient needs across all plan items
    const needs = new Map<string, { ingredient: any; needed: number }>();

    for (const item of plan.items) {
      const scaleFactor = item.quantity / Math.max(item.recipe.servings || 1, 1);

      // Direct ingredients
      for (const ri of item.recipe.ingredients) {
        const key = ri.ingredientId;
        const prev = needs.get(key) || { ingredient: ri.ingredient, needed: 0 };
        needs.set(key, { ingredient: ri.ingredient, needed: prev.needed + ri.quantity * scaleFactor });
      }

      // Sub-recipe ingredients (scaled by servingsUsed)
      for (const sr of item.recipe.subRecipes) {
        const subScale = (sr.servingsUsed / Math.max(sr.subRecipe.servings || 1, 1)) * item.quantity;
        for (const ri of sr.subRecipe.ingredients) {
          const key = ri.ingredientId;
          const prev = needs.get(key) || { ingredient: ri.ingredient, needed: 0 };
          needs.set(key, { ingredient: ri.ingredient, needed: prev.needed + ri.quantity * subScale });
        }
      }
    }

    // Compare needs vs stock
    const deficits = Array.from(needs.values())
      .map(({ ingredient, needed }) => ({
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        unit: ingredient.unit,
        needed: Math.round(needed * 100) / 100,
        have: ingredient.stockQuantity,
        deficit: Math.max(0, Math.round((needed - ingredient.stockQuantity) * 100) / 100),
        costToRestock: Math.max(0, (needed - ingredient.stockQuantity)) * ingredient.costPerUnit,
      }))
      .filter(d => d.needed > 0)
      .sort((a, b) => b.deficit - a.deficit);

    const missingItems = deficits.filter(d => d.deficit > 0);
    const totalRestockCost = missingItems.reduce((s, d) => s + d.costToRestock, 0);

    return { deficits, missingItems, totalRestockCost };
  });

  // ── Event production cost ─────────────────────────────────────────────────────

  // GET /events/:id/production-cost — production cost summary for an event
  app.get('/events/:id/production-cost', { preHandler: requireAuth }, async (request) => {
    const { id: eventId } = request.params as { id: string };

    const allocations = await (prisma as any).kitchenProductionAllocation.findMany({
      where: { eventId },
      include: {
        planItem: {
          include: {
            recipe: { select: { id: true, name: true, recipeType: true } },
            plan: { select: { id: true, status: true, createdAt: true } },
          },
        },
      },
    });

    const items = allocations.map((a: any) => ({
      recipeName: a.planItem.recipe.name,
      recipeType: a.planItem.recipe.recipeType,
      phase: a.planItem.phase,
      quantity: a.quantity,
      costShare: a.costShare,
      scheduledDate: a.planItem.scheduledDate,
      planStatus: a.planItem.plan.status,
    }));

    const totalCost = items.reduce((s: number, i: any) => s + i.costShare, 0);
    const totalItems = items.reduce((s: number, i: any) => s + i.quantity, 0);

    return { items, totalCost, totalItems };
  });

  // GET /kitchen/production-plans — list all plans (history)
  app.get('/kitchen/production-plans', { preHandler: requireAuth }, async (request) => {
    const user = (request as any).user;
    const employerId = getEmployerId(user);

    const plans = await (prisma as any).kitchenProductionPlan.findMany({
      where: employerId ? { employerId } : {},
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        _count: { select: { items: true } },
      },
    });

    return { plans };
  });
}
