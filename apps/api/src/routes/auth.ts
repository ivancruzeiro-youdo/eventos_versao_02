import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { normalizeCpf } from '../utils/cpf.js';

const loginSchema = z.object({
  email: z.string().email(),
  cpf: z.string(),
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

    // CPF is identifier, not password - just validate it matches
    // Normalize CPF to handle both masked (123.456.789-00) and unmasked (12345678900) formats
    if (normalizeCpf(freelancer.cpf) !== normalizeCpf(body.cpf)) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    if (freelancer.status === 'suspended') {
      return reply.status(403).send({ error: 'Account suspended' });
    }

    const token = app.jwt.sign({
      sub: freelancer.id,
      role: 'freelancer',
      email: freelancer.email,
    }, { expiresIn: '24h' });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours in seconds
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

    const freelancer = await prisma.freelancer.findUnique({
      where: { cpf: normalizeCpf(cpf) },
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

    const RECEPTIONIST_TERMS = ['recepcionista', 'recepção', 'recepcao'];
    const MANAGEMENT_TERMS = ['gestão', 'gestao', 'gerente', 'coordenador', 'supervisor', 'organizador'];

    const serviceNames = freelancer.services.map((fs: any) => fs.service.name.toLowerCase());
    const isReceptionist = serviceNames.some((n: string) => RECEPTIONIST_TERMS.some(t => n.includes(t)));
    const isManagement = serviceNames.some((n: string) => MANAGEMENT_TERMS.some(t => n.includes(t)));

    if (!isReceptionist && !isManagement) {
      return reply.status(403).send({ error: 'CPF não autorizado para check-in' });
    }

    const role = isReceptionist ? 'receptionist' : 'checkin_staff';

    const token = app.jwt.sign({
      sub: freelancer.id,
      role,
      email: freelancer.email,
    }, { expiresIn: '8h' });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60, // 8 hours in seconds
    });

    return {
      success: true,
      user: {
        id: freelancer.id,
        name: freelancer.name,
        role,
      },
    };
  });

  // Debug endpoint: diagnose SSO state (cookies + verify-token response)
  app.get('/sso-debug', async (request, reply) => {
    const youdoToken   = request.cookies['youdo_token'];
    const youdoUserRaw = request.cookies['youdo_user'];

    const result: Record<string, any> = {
      hasYoudoToken: !!youdoToken,
      hasYoudoUser: !!youdoUserRaw,
      tokenPreview: youdoToken ? youdoToken.slice(0, 20) + '…' : null,
    };

    if (youdoToken) {
      try {
        const rows = await (prisma as any).uerpConfig.findMany();
        const cfg: Record<string, string> = {};
        for (const r of rows) cfg[r.key] = r.value;
        const userpBaseUrl = cfg['userpBaseUrl'] || 'https://userpweb.youdobrasil.com.br';
        result.userpBaseUrl = userpBaseUrl;

        const verifyRes = await fetch(`${userpBaseUrl}/api/userp-satelite/verify-token/index.php`, {
          headers: { Authorization: `Bearer ${youdoToken}` },
        });
        result.verifyStatus = verifyRes.status;
        const body = await verifyRes.text();
        try { result.verifyBody = JSON.parse(body); } catch { result.verifyBody = body.slice(0, 200); }
      } catch (e: any) {
        result.error = e?.message;
      }
    }

    return result;
  });

  // SSO via YouDO Hub (Employer/Admin/Operator)
  // Reads youdo_token + youdo_user cookies set by hub.youdobrasil.com.br on .youdobrasil.com.br
  app.post('/userp-sso', async (request, reply) => {
    try {
      const youdoToken    = request.cookies['youdo_token'];
      const youdoUserRaw  = request.cookies['youdo_user'];

      if (!youdoToken) {
        return reply.status(401).send({ error: 'Cookie youdo_token ausente. Faça login em hub.youdobrasil.com.br primeiro.' });
      }

      // Load Userp base URL from DB config
      const rows = await (prisma as any).uerpConfig.findMany();
      const cfg: Record<string, string> = {};
      for (const r of rows) cfg[r.key] = r.value;
      const userpBaseUrl = cfg['userpBaseUrl'] || 'https://userpweb.youdobrasil.com.br';

      // Validate token via Userp verify-token
      let verifyRes: Response;
      try {
        verifyRes = await fetch(`${userpBaseUrl}/api/userp-satelite/verify-token/index.php`, {
          headers: { Authorization: `Bearer ${youdoToken}` },
        });
      } catch (fetchErr: any) {
        app.log.error({ fetchErr }, 'userp-sso: erro ao chamar verify-token');
        return reply.status(502).send({ error: 'Não foi possível conectar ao Userp para validar o token.' });
      }

      if (!verifyRes.ok) {
        return reply.status(401).send({ error: 'Token Userp inválido ou expirado. Faça login novamente em hub.youdobrasil.com.br.' });
      }

      let verified: { valid: boolean; user?: { tipo: string; codigo: string | number } };
      try {
        verified = await verifyRes.json();
      } catch {
        const raw = await verifyRes.text().catch(() => '(unreadable)');
        app.log.error({ raw }, 'userp-sso: verify-token retornou corpo não-JSON');
        return reply.status(502).send({ error: 'Resposta inesperada do Userp.' });
      }

      if (!verified.valid) {
        return reply.status(401).send({ error: 'Token Userp inválido.' });
      }

      const userpCodigo = verified.user?.codigo != null ? String(verified.user.codigo) : null;
      const userpTipo   = verified.user?.tipo ?? null;

      // Step 2: use name/email directly from youdo_user cookie set by hub.youdobrasil.com.br
      // The hub already knows the real user identity — no need to call the usuarios endpoint.
      // (codigo from verify-token ≠ usuario_id in usuarios table — different ID spaces)
      let hubName  = 'Usuário YouDO';
      let hubEmail = userpCodigo ? `${userpCodigo}@youdobrasil.com.br` : `sso-${Date.now()}@youdobrasil.com.br`;

      if (youdoUserRaw) {
        try {
          const parsed = JSON.parse(decodeURIComponent(youdoUserRaw));
          if (parsed.name) hubName  = parsed.name;
          if (parsed.email) hubEmail = parsed.email;
        } catch { /* ignore malformed cookie */ }
      }

      // Map Userp tipo → local role
      const tipoToRole = (tipo: string | null): 'admin' | 'event_owner' | 'operator' => {
        if (!tipo) return 'operator';
        const t = tipo.toLowerCase();
        if (t.includes('admin') || t === 'super') return 'admin';
        if (t.includes('gerente') || t.includes('manager') || t.includes('owner')) return 'event_owner';
        return 'operator';
      };
      const role = tipoToRole(userpTipo);

      const userDelegate = (prisma.user as any);

      // Find by userpCodigo first, then by email
      let user = userpCodigo
        ? await userDelegate.findFirst({ where: { userpCodigo } })
        : null;

      if (!user) {
        user = await userDelegate.findFirst({ where: { email: hubEmail } });
      }

      if (!user) {
        // Auto-create on first SSO login
        const employer = await prisma.employer.findFirst();
        if (!employer) {
          return reply.status(500).send({ error: 'Nenhum employer cadastrado. Configure a empresa primeiro.' });
        }
        user = await userDelegate.create({
          data: {
            email: hubEmail,
            name: hubName,
            role,
            employerId: employer.id,
            userpCodigo: userpCodigo ?? undefined,
            userpTipo: userpTipo ?? undefined,
          },
        });
      } else {
        // Update Userp metadata on each login, including name if we got a real one from the cookie
        await userDelegate.update({
          where: { id: user.id },
          data: {
            userpCodigo: userpCodigo ?? undefined,
            userpTipo: userpTipo ?? undefined,
            ...(hubName !== 'Usuário YouDO' ? { name: hubName } : {}),
            ...(hubEmail && !hubEmail.includes('@youdobrasil.com.br') ? { email: hubEmail } : {}),
          },
        });
      }

      const localToken = app.jwt.sign({
        sub: user.id,
        role: user.role,
        email: user.email,
        employerId: user.employerId,
      }, { expiresIn: '24h' });

      reply.setCookie('token', localToken, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60,
      });

      return {
        success: true,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      };
    } catch (err: any) {
      app.log.error({ err: err?.message, stack: err?.stack }, 'userp-sso: erro inesperado');
      return reply.status(500).send({ error: err?.message || 'Erro interno no SSO.' });
    }
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
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60, // 24 hours in seconds
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
      reply.clearCookie('token', { path: '/' });
      return reply.status(401).send({ error: 'Invalid token' });
    }
  });
}
