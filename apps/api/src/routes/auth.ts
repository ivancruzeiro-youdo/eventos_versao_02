import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../server.js';

const loginSchema = z.object({
  email: z.string().email(),
  cpf: z.string(),
});

const ssoCallbackSchema = z.object({
  code: z.string(),
});

const receptionistLoginSchema = z.object({
  cpf: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  // Health check
  app.get('/health', async () => {
    return { status: 'ok', service: 'auth' };
  });

  // Freelancer login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    
    const freelancer = await prisma.freelancer.findUnique({
      where: { email: body.email },
    });

    if (!freelancer) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    // CPF is identifier, not password - validate it matches (normalize both sides)
    const cleanInput = body.cpf.replace(/\D/g, '');
    const cleanStored = freelancer.cpf.replace(/\D/g, '');
    if (cleanInput !== cleanStored) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    if (freelancer.status === 'suspended') {
      return reply.status(403).send({ error: 'Account suspended' });
    }

    const token = app.jwt.sign({
      sub: freelancer.id,
      role: 'freelancer',
      email: freelancer.email,
    }, { expiresIn: '7d' });

    reply.setCookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      success: true,
      user: {
        id: freelancer.id,
        name: freelancer.name,
        email: freelancer.email,
        role: 'freelancer',
      },
    };
  });

  // Receptionist login (CPF only)
  app.post('/receptionist-login', async (request, reply) => {
    const { cpf } = receptionistLoginSchema.parse(request.body);
    const cleanCpf = cpf.replace(/\D/g, '');

    const freelancer = await prisma.freelancer.findFirst({
      where: { cpf: { contains: cleanCpf } },
      include: {
        services: {
          include: { service: true },
        },
      },
    });

    if (!freelancer) {
      return reply.status(401).send({ error: 'CPF não encontrado' });
    }

    if (freelancer.status === 'suspended') {
      return reply.status(403).send({ error: 'Conta suspensa' });
    }

    // Check if has receptionist service
    const hasReceptionistService = freelancer.services.some(
      (fs: any) => fs.service.name.toLowerCase().includes('recepcionista') || fs.service.name.toLowerCase().includes('recepção')
    );

    if (!hasReceptionistService) {
      return reply.status(403).send({ error: 'Sem permissão de recepcionista' });
    }

    const token = app.jwt.sign({
      sub: freelancer.id,
      role: 'receptionist',
      email: freelancer.email,
    }, { expiresIn: '8h' });

    reply.setCookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    });

    return {
      success: true,
      user: {
        id: freelancer.id,
        name: freelancer.name,
        role: 'receptionist',
      },
    };
  });

  // Login (Employer/Admin/Operator) - email + password
  app.post('/dev-login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password?: string };

    if (!email) {
      return reply.status(400).send({ error: 'E-mail obrigatório' });
    }

    // Find or create user based on email
    let user = await prisma.user.findFirst({ where: { email } });

    if (!user) {
      // First-time: auto-create user based on email prefix (bootstrap only)
      const employer = await prisma.employer.findFirst();
      if (!employer) {
        return reply.status(500).send({ error: 'Nenhum employer encontrado. Execute db:seed primeiro.' });
      }

      const role = email.includes('admin') ? 'admin'
        : email.includes('owner') ? 'event_owner'
        : 'operator';

      user = await prisma.user.create({
        data: {
          email,
          name: email.split('@')[0],
          role,
          employerId: employer.id,
        },
      });
    }

    // If user has a password set, validate it
    if (user.passwordHash) {
      if (!password) {
        return reply.status(401).send({ error: 'Senha obrigatória' });
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: 'Senha incorreta' });
      }
    }
    // If no passwordHash yet: allow login without password (until admin sets one)

    const token = app.jwt.sign({
      sub: user.id,
      role: user.role,
      email: user.email,
      employerId: user.employerId,
    }, { expiresIn: '24h' });

    reply.setCookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
    });

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  });

  // SSO Callback (Employer/Admin/Operator)
  app.get('/sso/callback', async (request, reply) => {
    const { code } = ssoCallbackSchema.parse(request.query);
    
    // TODO: Implement SSO Hub bridge
    // 1. Exchange code with SSO Hub
    // 2. Get user data from Hub
    // 3. Create/update user in local DB
    // 4. Generate JWT
    
    return reply.status(501).send({
      error: 'SSO bridge not yet implemented',
    });
  });

  // Refresh token
  app.post('/refresh', async (request, reply) => {
    const token = request.cookies.token;
    
    if (!token) {
      return reply.status(401).send({ error: 'No token provided' });
    }

    try {
      const decoded = app.jwt.verify(token);
      const newToken = app.jwt.sign(decoded, { expiresIn: '24h' });
      
      reply.setCookie('token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
      });

      return { success: true };
    } catch {
      return reply.status(401).send({ error: 'Invalid token' });
    }
  });

  // Logout
  app.delete('/logout', async (request, reply) => {
    // TODO: Add token to blacklist in Redis
    reply.clearCookie('token', {
      path: '/',
    });
    return { success: true };
  });

  // Get current user
  app.get('/me', async (request, reply) => {
    const token = request.cookies.token;
    
    if (!token) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    try {
      const decoded = app.jwt.verify(token) as { sub: string; role: string };
      
      if (decoded.role === 'freelancer') {
        const freelancer = await prisma.freelancer.findUnique({
          where: { id: decoded.sub },
          select: { id: true, name: true, email: true, status: true },
        });
        return { user: { ...freelancer, role: 'freelancer' } };
      } else {
        const user = await prisma.user.findUnique({
          where: { id: decoded.sub },
          select: { id: true, name: true, email: true, role: true },
        });
        return { user };
      }
    } catch {
      return reply.status(401).send({ error: 'Invalid token' });
    }
  });
}
