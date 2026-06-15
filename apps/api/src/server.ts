import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import pino from 'pino';
import { prisma } from '@youdo/db';

import { authRoutes } from './routes/auth.js';
import { eventRoutes } from './routes/events.js';
import { guestRoutes } from './routes/guests.js';
import { freelancerRoutes } from './routes/freelancers.js';
import { planRoutes } from './routes/plans.js';
import { fileRoutes } from './routes/files.js';
import { npsRoutes } from './routes/nps.js';
import { adminRoutes } from './routes/admin.js';
import { uerpRoutes } from './routes/uerp.js';
import { reportRoutes } from './routes/reports.js';
import { briefingTemplateRoutes } from './routes/briefing-templates.js';
import { checklistTemplateRoutes } from './routes/checklist-templates.js';
import { briefingRoutes } from './routes/briefings.js';
import { commentRoutes } from './routes/comments.js';
import { scheduleRoutes } from './routes/schedules.js';
import { teamRoutes } from './routes/teams.js';
import { productQuestionRoutes } from './routes/product-questions.js';
import { servicesRoutes } from './routes/services.js';
import { syncEventsRoutes } from './routes/sync-events.js';
import { kitchenRoutes } from './routes/kitchen.js';
import { kitchenPlanRoutes } from './routes/kitchen-plan.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

const app = Fastify({
  logger,
});

// Prisma client is imported from @youdo/db
export { prisma };

// Health check
app.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  };
});

// Error handler
app.setErrorHandler((error, request, reply) => {
  app.log.error(error);
  
  if (error.statusCode === 429) {
    return reply.status(429).send({
      error: 'Too many requests',
      message: 'Rate limit exceeded',
    });
  }
  
  reply.status(error.statusCode || 500).send({
    error: error.name,
    message: error.message,
  });
});

// Start server
const start = async () => {
  try {
    // Register plugins
    // CORS first to ensure it handles preflight before helmet
    await app.register(cors, {
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    });
    await app.register(helmet, {
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    });

    await app.register(jwt, {
      secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
      cookie: {
        cookieName: 'token',
        signed: false,
      },
    });

    await app.register(cookie);

    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });

    // Swagger documentation
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'YOUDO Experience API',
          description: 'API REST para gestão de eventos',
          version: '2.0.0',
        },
        servers: [
          {
            url: 'http://localhost:3001',
          },
        ],
      },
    });

    await app.register(swaggerUi, {
      routePrefix: '/documentation',
    });

    // Register routes
    await app.register(authRoutes, { prefix: '/api/v2/auth' });
    await app.register(eventRoutes, { prefix: '/api/v2/events' });
    await app.register(guestRoutes, { prefix: '/api/v2' });
    await app.register(freelancerRoutes, { prefix: '/api/v2' });
    await app.register(planRoutes, { prefix: '/api/v2' });
    await app.register(fileRoutes, { prefix: '/api/v2' });
    await app.register(npsRoutes, { prefix: '/api/v2' });
    await app.register(adminRoutes, { prefix: '/api/v2/admin' });
    await app.register(uerpRoutes, { prefix: '/api/v2' });
    await app.register(reportRoutes, { prefix: '/api/v2/reports' });
    await app.register(briefingTemplateRoutes, { prefix: '/api/v2' });
    await app.register(checklistTemplateRoutes, { prefix: '/api/v2' });
    await app.register(briefingRoutes, { prefix: '/api/v2' });
    await app.register(commentRoutes, { prefix: '/api/v2' });
    await app.register(scheduleRoutes, { prefix: '/api/v2' });
    await app.register(teamRoutes, { prefix: '/api/v2' });
    await app.register(productQuestionRoutes, { prefix: '/api/v2' });
    await app.register(servicesRoutes, { prefix: '/api/v2' });
  await app.register(syncEventsRoutes, { prefix: '/api/v2' });
  await app.register(kitchenRoutes, { prefix: '/api/v2' });
  await app.register(kitchenPlanRoutes, { prefix: '/api/v2' });

    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await app.listen({ port, host });
    app.log.info(`Server running at http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
