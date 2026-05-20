import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../server.js';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies.token;
  
  if (!token) {
    return reply.status(401).send({ error: 'Authentication required' });
  }

  try {
    const decoded = request.server.jwt.verify(token) as {
      sub: string;
      role: string;
      email?: string;
      employerId?: string;
    };

    let user;
    
    if (decoded.role === 'freelancer') {
      const freelancer = await prisma.freelancer.findUnique({
        where: { id: decoded.sub },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
        },
      });
      
      if (!freelancer) {
        return reply.status(401).send({ error: 'User not found' });
      }
      
      if (freelancer.status === 'suspended') {
        return reply.status(403).send({ error: 'Account suspended' });
      }
      
      user = {
        ...freelancer,
        role: 'freelancer',
      };
    } else {
      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.sub },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          employerId: true,
        },
      });
      
      if (!dbUser) {
        return reply.status(401).send({ error: 'User not found' });
      }
      
      user = dbUser;
    }

    (request as any).user = user;
  } catch (error) {
    return reply.status(401).send({ error: 'Invalid token' });
  }
}

export function requireRole(allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(user.role)) {
      return reply.status(403).send({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: user.role,
      });
    }
  };
}
