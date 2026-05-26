import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getEmployerId(user: any): string | undefined {
  return user.employerId;
}

function kitchenWhere(user: any) {
  if (user.role === 'admin') return {};
  return { employerId: getEmployerId(user) };
}

// Transform Prisma recipe to frontend-expected shape.
// Schema uses: ingredients, prepTime, steps.order, steps.text, subRecipes.servingsUsed
// Frontend expects: recipeIngredients, prepTimeMinutes, steps.stepNumber, steps.description
function transformRecipe(recipe: any) {
  if (!recipe) return recipe;
  return {
    ...recipe,
    recipeType: recipe.recipeType ?? 'final',
    prepTimeMinutes: recipe.prepTime,
    recipeIngredients: recipe.ingredients ?? [],
    steps: (recipe.steps ?? []).map((s: any) => ({
      ...s,
      stepNumber: s.order,
      description: s.text,
    })),
    subRecipes: (recipe.subRecipes ?? []).map((sr: any) => ({
      ...sr,
      quantity: sr.servingsUsed,
      // nest transformed subRecipe if present
      subRecipe: sr.subRecipe ? transformRecipe(sr.subRecipe) : undefined,
    })),
  };
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const ingredientSchema = z.object({
  name: z.string().min(1),
  category: z.string().default('Outros'),
  unit: z.string().min(1),
  costPerUnit: z.number().min(0).default(0),
  stockQuantity: z.number().min(0).default(0),
  minQuantity: z.number().min(0).default(0),
  storageType: z.enum(['dry', 'frozen', 'refrigerated']).default('dry'),
});

const recipeIngredientSchema = z.object({
  ingredientId: z.string(),
  quantity: z.number().min(0),
  unit: z.string().optional(),
});

const recipeStepSchema = z.object({
  stepNumber: z.number().int().min(1),
  description: z.string(),
  durationMinutes: z.number().int().min(0).optional(), // accepted but not stored (no column)
});

const subRecipeSchema = z.object({
  subRecipeId: z.string(),
  quantity: z.number().min(0).default(1), // maps to servingsUsed in DB
});

const recipeSchema = z.object({
  name: z.string().min(1),
  category: z.string().default('Outros'),
  recipeType: z.enum(['base', 'final']).default('final'),
  servings: z.number().int().min(1).default(1),
  averagePerGuest: z.number().min(0).default(1),
  prepTimeMinutes: z.number().int().min(0).default(0), // maps to prepTime in DB
  notes: z.string().optional(),
  productId: z.string().optional(),
  ingredients: z.array(recipeIngredientSchema).default([]),
  steps: z.array(recipeStepSchema).default([]),
  subRecipes: z.array(subRecipeSchema).default([]),
});

const purchaseItemSchema = z.object({
  ingredientId: z.string().optional(),
  productName: z.string().min(1),
  quantity: z.number().min(0),
  unit: z.string(),
  unitPrice: z.number().min(0),
  totalPrice: z.number().min(0),
});

const purchaseRecordSchema = z.object({
  storeName: z.string().min(1),
  date: z.string(),
  totalAmount: z.number().min(0),
  source: z.enum(['foto', 'manual']).default('manual'),
  items: z.array(purchaseItemSchema).default([]),
  updatePrices: z.boolean().default(true),
  updateStock: z.boolean().default(true),
});

const laborRoleSchema = z.object({
  name: z.string().min(1),
  dailyRate: z.number().min(0),
});

const eventMenuSchema = z.object({
  recipeId: z.string(),
  menuType: z.enum(['guest', 'staff']).default('guest'),
  servingsNeeded: z.number().min(0).optional(),
  eventItemId: z.string().optional(),
});

const eventLaborSchema = z.object({
  laborRoleId: z.string(),
  quantity: z.number().int().min(1).default(1),
  days: z.number().min(0.5).default(1),
});

const productionLogSchema = z.object({
  recipeId: z.string(),
  portionsProduced: z.number().min(0),
  notes: z.string().optional(),
  ingredientDeductions: z.array(z.object({
    ingredientId: z.string(),
    quantity: z.number().min(0),
  })).optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export async function kitchenRoutes(app: FastifyInstance) {

  // ── INGREDIENTS ──────────────────────────────────────────────────────────

  app.get('/kitchen/ingredients', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const ingredients = await prisma.kitchenIngredient.findMany({
      where: kitchenWhere(user),
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return { ingredients };
  });

  app.post('/kitchen/ingredients', { preHandler: [requireAuth, requireRole(['admin', 'event_owner', 'operator'])] }, async (request, reply) => {
    const user = (request as any).user;
    const data = ingredientSchema.parse(request.body);
    const ingredient = await prisma.kitchenIngredient.create({
      data: { ...data, employerId: getEmployerId(user)! },
    });
    return reply.status(201).send({ ingredient });
  });

  app.patch('/kitchen/ingredients/:id', { preHandler: [requireAuth, requireRole(['admin', 'event_owner', 'operator'])] }, async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params as { id: string };
    const data = ingredientSchema.partial().parse(request.body);
    const ingredient = await prisma.kitchenIngredient.update({
      where: { id, ...kitchenWhere(user) },
      data,
    });
    return { ingredient };
  });

  app.delete('/kitchen/ingredients/:id', { preHandler: [requireAuth, requireRole(['admin', 'event_owner'])] }, async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params as { id: string };
    await prisma.kitchenIngredient.delete({ where: { id, ...kitchenWhere(user) } });
    return { success: true };
  });

  // ── RECIPES ───────────────────────────────────────────────────────────────

  app.get('/kitchen/recipes', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const recipes = await prisma.kitchenRecipe.findMany({
      where: kitchenWhere(user),
      include: {
        ingredients: { include: { ingredient: true } },        // schema field: ingredients
        steps: { orderBy: { order: 'asc' } },                 // schema field: order
        subRecipes: { include: { subRecipe: true } },
        product: { select: { id: true, name: true } },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return { recipes: recipes.map(transformRecipe) };
  });

  app.get('/kitchen/recipes/:id', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params as { id: string };
    const recipe = await prisma.kitchenRecipe.findFirst({
      where: { id, ...kitchenWhere(user) },
      include: {
        ingredients: { include: { ingredient: true } },
        steps: { orderBy: { order: 'asc' } },
        subRecipes: { include: { subRecipe: { include: { ingredients: { include: { ingredient: true } } } } } },
        product: { select: { id: true, name: true } },
      },
    });
    if (!recipe) return reply.status(404).send({ error: 'Recipe not found' });
    return { recipe: transformRecipe(recipe) };
  });

  app.post('/kitchen/recipes', { preHandler: [requireAuth, requireRole(['admin', 'event_owner', 'operator'])] }, async (request, reply) => {
    const user = (request as any).user;
    const data = recipeSchema.parse(request.body);
    const { ingredients, steps, subRecipes, prepTimeMinutes, ...restRecipeData } = data;

    const recipe = await prisma.kitchenRecipe.create({
      data: {
        ...restRecipeData,
        prepTime: prepTimeMinutes,                            // schema field: prepTime
        employerId: getEmployerId(user)!,
        ingredients: ingredients.length > 0 ? {
          create: ingredients.map(i => ({
            ingredientId: i.ingredientId,
            quantity: i.quantity,
            unit: i.unit ?? '',
          })),
        } : undefined,
        steps: steps.length > 0 ? {
          create: steps.map(s => ({
            order: s.stepNumber,                              // schema field: order
            text: s.description,                             // schema field: text
          })),
        } : undefined,
        subRecipes: subRecipes.length > 0 ? {
          create: subRecipes.map(sr => ({
            subRecipeId: sr.subRecipeId,
            servingsUsed: sr.quantity,                       // schema field: servingsUsed
          })),
        } : undefined,
      },
      include: {
        ingredients: { include: { ingredient: true } },
        steps: { orderBy: { order: 'asc' } },
        subRecipes: { include: { subRecipe: true } },
      },
    });
    return reply.status(201).send({ recipe: transformRecipe(recipe) });
  });

  app.patch('/kitchen/recipes/:id', { preHandler: [requireAuth, requireRole(['admin', 'event_owner', 'operator'])] }, async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params as { id: string };
    const data = recipeSchema.partial().parse(request.body);
    const { ingredients, steps, subRecipes, prepTimeMinutes, ...restRecipeData } = data;

    await prisma.$transaction(async (tx) => {
      if (ingredients !== undefined) {
        await tx.kitchenRecipeIngredient.deleteMany({ where: { recipeId: id } });
      }
      if (steps !== undefined) {
        await tx.kitchenRecipeStep.deleteMany({ where: { recipeId: id } });
      }
      if (subRecipes !== undefined) {
        await tx.kitchenSubRecipe.deleteMany({ where: { parentId: id } });   // schema field: parentId
      }

      await tx.kitchenRecipe.update({
        where: { id },
        data: {
          ...restRecipeData,
          ...(prepTimeMinutes !== undefined ? { prepTime: prepTimeMinutes } : {}),
          ingredients: ingredients ? {
            create: ingredients.map(i => ({
              ingredientId: i.ingredientId,
              quantity: i.quantity,
              unit: i.unit ?? '',
            })),
          } : undefined,
          steps: steps ? {
            create: steps.map(s => ({
              order: s.stepNumber,
              text: s.description,
            })),
          } : undefined,
          subRecipes: subRecipes ? {
            create: subRecipes.map(sr => ({
              subRecipeId: sr.subRecipeId,
              servingsUsed: sr.quantity,
            })),
          } : undefined,
        },
      });
    });

    const recipe = await prisma.kitchenRecipe.findUnique({
      where: { id },
      include: {
        ingredients: { include: { ingredient: true } },
        steps: { orderBy: { order: 'asc' } },
        subRecipes: { include: { subRecipe: true } },
      },
    });
    return { recipe: transformRecipe(recipe) };
  });

  app.delete('/kitchen/recipes/:id', { preHandler: [requireAuth, requireRole(['admin', 'event_owner'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.kitchenRecipe.delete({ where: { id } });
    return { success: true };
  });

  // ── SHOPPING LIST ─────────────────────────────────────────────────────────

  app.get('/kitchen/shopping-list', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const query = request.query as any;
    const eventIdsRaw: string = query.eventIds || '';
    const eventIds = eventIdsRaw.split(',').map((s: string) => s.trim()).filter(Boolean);

    if (eventIds.length === 0) {
      return reply.status(400).send({ error: 'eventIds query param required (comma-separated)' });
    }

    const eventMenus = await prisma.kitchenEventMenu.findMany({
      where: { eventId: { in: eventIds }, event: kitchenWhere(user) },
      include: {
        recipe: {
          include: {
            ingredients: { include: { ingredient: true } },
            subRecipes: {
              include: {
                subRecipe: {
                  include: { ingredients: { include: { ingredient: true } } },
                },
              },
            },
          },
        },
        event: { select: { id: true, name: true, _count: { select: { guests: true } } } },
      },
    });

    const needMap = new Map<string, { ingredient: any; quantityNeeded: number }>();

    function addIngredients(ingredientList: any[], multiplier: number) {
      for (const ri of ingredientList) {
        const existing = needMap.get(ri.ingredientId);
        const qty = ri.quantity * multiplier;
        if (existing) {
          existing.quantityNeeded += qty;
        } else {
          needMap.set(ri.ingredientId, { ingredient: ri.ingredient, quantityNeeded: qty });
        }
      }
    }

    for (const em of eventMenus) {
      const recipe = em.recipe;
      const guestCount = em.servingsNeeded ?? em.event._count?.guests ?? 0;
      const portionMultiplier = recipe.servings > 0 ? (guestCount * recipe.averagePerGuest) / recipe.servings : 1;

      addIngredients(recipe.ingredients, portionMultiplier);

      for (const sr of recipe.subRecipes) {
        const subMultiplier = portionMultiplier * (sr.servingsUsed || 1);  // schema: servingsUsed
        addIngredients(sr.subRecipe.ingredients, subMultiplier);
      }
    }

    const items = Array.from(needMap.values()).map(({ ingredient, quantityNeeded }) => {
      const inStock = ingredient.stockQuantity || 0;
      const toBuy = Math.max(0, quantityNeeded - inStock);
      return {
        ingredientId: ingredient.id,
        name: ingredient.name,
        category: ingredient.category,
        unit: ingredient.unit,
        costPerUnit: ingredient.costPerUnit,
        quantityNeeded: Math.round(quantityNeeded * 1000) / 1000,
        inStock: Math.round(inStock * 1000) / 1000,
        toBuy: Math.round(toBuy * 1000) / 1000,
        estimatedCost: Math.round(toBuy * ingredient.costPerUnit * 100) / 100,
      };
    }).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

    const totalCost = items.reduce((sum, i) => sum + i.estimatedCost, 0);
    return { items, totalCost, eventCount: eventIds.length };
  });

  // ── PURCHASES ─────────────────────────────────────────────────────────────

  app.get('/kitchen/purchases', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const records = await prisma.kitchenPurchaseRecord.findMany({
      where: kitchenWhere(user),
      include: {
        items: { include: { ingredient: { select: { id: true, name: true, unit: true } } } },
      },
      orderBy: { date: 'desc' },
    });
    return { records };
  });

  app.post('/kitchen/purchases', { preHandler: [requireAuth, requireRole(['admin', 'event_owner', 'operator'])] }, async (request, reply) => {
    const user = (request as any).user;
    const data = purchaseRecordSchema.parse(request.body);
    const { items, updatePrices, updateStock, ...recordData } = data;

    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.kitchenPurchaseRecord.create({
        data: {
          storeName: recordData.storeName,
          date: new Date(recordData.date),
          totalAmount: recordData.totalAmount,
          source: recordData.source,
          employerId: getEmployerId(user)!,
          items: {
            create: items.map(item => ({
              ingredientId: item.ingredientId || null,
              productName: item.productName,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
          },
        },
        include: { items: true },
      });

      if (updatePrices || updateStock) {
        for (const item of items) {
          if (item.ingredientId) {
            const updateData: any = {};
            if (updatePrices && item.unitPrice > 0) {
              updateData.costPerUnit = item.unitPrice;
            }
            if (updateStock && item.quantity > 0) {
              const current = await tx.kitchenIngredient.findUnique({
                where: { id: item.ingredientId },
                select: { stockQuantity: true },
              });
              if (current) {
                updateData.stockQuantity = current.stockQuantity + item.quantity;
              }
            }
            if (Object.keys(updateData).length > 0) {
              await tx.kitchenIngredient.update({
                where: { id: item.ingredientId },
                data: updateData,
              });
            }
          }
        }
      }

      return created;
    });

    return reply.status(201).send({ record });
  });

  app.delete('/kitchen/purchases/:id', { preHandler: [requireAuth, requireRole(['admin', 'event_owner'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.kitchenPurchaseRecord.delete({ where: { id } });
    return { success: true };
  });

  // ── LABOR ROLES ───────────────────────────────────────────────────────────

  app.get('/kitchen/labor-roles', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const roles = await prisma.kitchenLaborRole.findMany({
      where: kitchenWhere(user),
      orderBy: { name: 'asc' },
    });
    return { roles };
  });

  app.post('/kitchen/labor-roles', { preHandler: [requireAuth, requireRole(['admin', 'event_owner', 'operator'])] }, async (request, reply) => {
    const user = (request as any).user;
    const data = laborRoleSchema.parse(request.body);
    const role = await prisma.kitchenLaborRole.create({
      data: { ...data, employerId: getEmployerId(user)! },
    });
    return reply.status(201).send({ role });
  });

  app.patch('/kitchen/labor-roles/:id', { preHandler: [requireAuth, requireRole(['admin', 'event_owner', 'operator'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = laborRoleSchema.partial().parse(request.body);
    const role = await prisma.kitchenLaborRole.update({ where: { id }, data });
    return { role };
  });

  app.delete('/kitchen/labor-roles/:id', { preHandler: [requireAuth, requireRole(['admin', 'event_owner'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.kitchenLaborRole.delete({ where: { id } });
    return { success: true };
  });

  // ── EVENT KITCHEN MENU ────────────────────────────────────────────────────

  app.get('/kitchen/events/:eventId/menu', { preHandler: requireAuth }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const menus = await prisma.kitchenEventMenu.findMany({
      where: { eventId },
      include: {
        recipe: {
          include: {
            ingredients: { include: { ingredient: true } },
            subRecipes: { include: { subRecipe: true } },
          },
        },
        eventItem: { select: { id: true, name: true, quantity: true } },
      },
      orderBy: [{ menuType: 'asc' }, { createdAt: 'asc' }],
    });

    const menusWithCost = menus.map(m => {
      const recipeCost = m.recipe.ingredients.reduce(
        (sum, ri) => sum + ri.quantity * (ri.ingredient?.costPerUnit ?? 0),
        0
      );
      return {
        ...m,
        recipe: transformRecipe(m.recipe),
        recipeCostPerServing: m.recipe.servings > 0 ? recipeCost / m.recipe.servings : 0,
      };
    });

    return { menus: menusWithCost };
  });

  app.post('/kitchen/events/:eventId/menu', { preHandler: [requireAuth, requireRole(['admin', 'event_owner', 'operator'])] }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const data = eventMenuSchema.parse(request.body);

    const existing = await prisma.kitchenEventMenu.findFirst({
      where: { eventId, recipeId: data.recipeId, menuType: data.menuType },
    });
    if (existing) {
      return reply.status(409).send({ error: 'Recipe already in this menu type for this event' });
    }

    const menu = await prisma.kitchenEventMenu.create({
      data: {
        eventId,
        recipeId: data.recipeId,
        menuType: data.menuType,
        servingsNeeded: data.servingsNeeded,
        eventItemId: data.eventItemId,
      },
      include: { recipe: true },
    });
    return reply.status(201).send({ menu });
  });

  app.patch('/kitchen/events/:eventId/menu/:menuId', { preHandler: [requireAuth, requireRole(['admin', 'event_owner', 'operator'])] }, async (request, reply) => {
    const { menuId } = request.params as { eventId: string; menuId: string };
    const data = eventMenuSchema.partial().parse(request.body);
    const menu = await prisma.kitchenEventMenu.update({ where: { id: menuId }, data });
    return { menu };
  });

  app.delete('/kitchen/events/:eventId/menu/:menuId', { preHandler: [requireAuth, requireRole(['admin', 'event_owner'])] }, async (request, reply) => {
    const { menuId } = request.params as { eventId: string; menuId: string };
    await prisma.kitchenEventMenu.delete({ where: { id: menuId } });
    return { success: true };
  });

  // ── EVENT LABOR ───────────────────────────────────────────────────────────

  app.get('/kitchen/events/:eventId/labor', { preHandler: requireAuth }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const labor = await prisma.kitchenEventLabor.findMany({
      where: { eventId },
      include: { laborRole: true },
      orderBy: { createdAt: 'asc' },
    });
    return { labor };
  });

  app.post('/kitchen/events/:eventId/labor', { preHandler: [requireAuth, requireRole(['admin', 'event_owner', 'operator'])] }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const data = eventLaborSchema.parse(request.body);
    const labor = await prisma.kitchenEventLabor.create({
      data: { eventId, ...data },
      include: { laborRole: true },
    });
    return reply.status(201).send({ labor });
  });

  app.patch('/kitchen/events/:eventId/labor/:laborId', { preHandler: [requireAuth, requireRole(['admin', 'event_owner', 'operator'])] }, async (request, reply) => {
    const { laborId } = request.params as { eventId: string; laborId: string };
    const data = eventLaborSchema.partial().parse(request.body);
    const labor = await prisma.kitchenEventLabor.update({
      where: { id: laborId },
      data,
      include: { laborRole: true },
    });
    return { labor };
  });

  app.delete('/kitchen/events/:eventId/labor/:laborId', { preHandler: [requireAuth, requireRole(['admin', 'event_owner'])] }, async (request, reply) => {
    const { laborId } = request.params as { eventId: string; laborId: string };
    await prisma.kitchenEventLabor.delete({ where: { id: laborId } });
    return { success: true };
  });

  // ── PRODUCTION LOGS ───────────────────────────────────────────────────────

  app.get('/kitchen/events/:eventId/production', { preHandler: requireAuth }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const logs = await prisma.kitchenProductionLog.findMany({
      where: { eventId },
      include: { recipe: { select: { id: true, name: true, servings: true } } },
      orderBy: { producedAt: 'desc' },
    });
    return { logs };
  });

  app.post('/kitchen/events/:eventId/production', { preHandler: [requireAuth, requireRole(['admin', 'event_owner', 'operator'])] }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const data = productionLogSchema.parse(request.body);

    const log = await prisma.$transaction(async (tx) => {
      const created = await tx.kitchenProductionLog.create({
        data: {
          eventId,
          recipeId: data.recipeId,
          portionsProduced: data.portionsProduced,
          notes: data.notes,
          producedAt: new Date(),
        },
      });

      if (data.ingredientDeductions && data.ingredientDeductions.length > 0) {
        for (const deduction of data.ingredientDeductions) {
          const ingredient = await tx.kitchenIngredient.findUnique({
            where: { id: deduction.ingredientId },
            select: { stockQuantity: true },
          });
          if (ingredient) {
            await tx.kitchenIngredient.update({
              where: { id: deduction.ingredientId },
              data: { stockQuantity: Math.max(0, ingredient.stockQuantity - deduction.quantity) },
            });
          }
        }
      } else {
        // Auto-deduct based on recipe ingredients × portions
        const recipe = await tx.kitchenRecipe.findUnique({
          where: { id: data.recipeId },
          include: { ingredients: true },              // schema field: ingredients
        });
        if (recipe && recipe.servings > 0) {
          const multiplier = data.portionsProduced / recipe.servings;
          for (const ri of recipe.ingredients) {     // schema field: ingredients
            const ingredient = await tx.kitchenIngredient.findUnique({
              where: { id: ri.ingredientId },
              select: { stockQuantity: true },
            });
            if (ingredient) {
              await tx.kitchenIngredient.update({
                where: { id: ri.ingredientId },
                data: { stockQuantity: Math.max(0, ingredient.stockQuantity - ri.quantity * multiplier) },
              });
            }
          }
        }
      }

      return created;
    });

    return reply.status(201).send({ log });
  });

  // ── COST SUMMARY FOR EVENT ────────────────────────────────────────────────

  app.get('/kitchen/events/:eventId/cost-summary', { preHandler: requireAuth }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };

    const [menus, labor, event] = await Promise.all([
      prisma.kitchenEventMenu.findMany({
        where: { eventId },
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
      }),
      prisma.kitchenEventLabor.findMany({
        where: { eventId },
        include: { laborRole: true },
      }),
      prisma.event.findUnique({
        where: { id: eventId },
        select: { name: true, _count: { select: { guests: true } } },
      }),
    ]);

    const guestCount = event?._count?.guests ?? 0;

    let ingredientCost = 0;
    for (const m of menus) {
      const recipe = m.recipe;
      const servingsNeeded = m.servingsNeeded ?? guestCount * recipe.averagePerGuest;
      const multiplier = recipe.servings > 0 ? servingsNeeded / recipe.servings : 1;

      for (const ri of recipe.ingredients) {          // schema field: ingredients
        ingredientCost += ri.quantity * multiplier * (ri.ingredient?.costPerUnit ?? 0);
      }
      for (const sr of recipe.subRecipes) {
        const subMultiplier = multiplier * (sr.servingsUsed || 1);  // schema field: servingsUsed
        for (const ri of sr.subRecipe.ingredients) {  // schema field: ingredients
          ingredientCost += ri.quantity * subMultiplier * (ri.ingredient?.costPerUnit ?? 0);
        }
      }
    }

    const laborCost = labor.reduce((sum, l) => sum + l.quantity * l.days * l.laborRole.dailyRate, 0);
    const totalCost = ingredientCost + laborCost;
    const suggestedPrice = totalCost > 0 ? totalCost / 0.30 : 0; // 70% margin

    return {
      eventId,
      eventName: event?.name,
      guestCount,
      ingredientCost: Math.round(ingredientCost * 100) / 100,
      laborCost: Math.round(laborCost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      suggestedPrice: Math.round(suggestedPrice * 100) / 100,
      marginPercent: 70,
    };
  });
}
