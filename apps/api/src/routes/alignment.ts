import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';
import { buildAlignmentContext, buildAlignmentScript, summarizeScript } from '../lib/alignment-script.js';

const participantsSchema = z.array(z.object({
  personId: z.string().min(1),
  role: z.string().trim().min(1).max(80).default('Participante'),
})).min(1, 'Informe pelo menos um participante.');

// Reunião de alinhamento do plano do evento (roteiro = perguntas do plano; ver lib/alignment-script).
// As respostas continuam sendo gravadas pelas rotas normais do plano (venue-answers / items/.../answers),
// com histórico por usuário; aqui ficam só a reunião, os participantes e o roteiro.
export async function alignmentRoutes(app: FastifyInstance) {
  async function participantsSnapshot(eventId: string, ids: { personId: string; role: string }[]) {
    const people = await (prisma as any).person.findMany({ where: { id: { in: ids.map(i => i.personId) } }, select: { id: true, name: true } });
    return ids.map(i => ({ personId: i.personId, name: people.find((p: any) => p.id === i.personId)?.name ?? '—', role: i.role }));
  }

  // GET /events/:id/alignment — reunião atual (em andamento ou a última finalizada), roteiro e contratado
  app.get('/events/:id/alignment', { preHandler: requireAuth }, async (request) => {
    const { id: eventId } = request.params as { id: string };
    const [active, last, steps, context, members] = await Promise.all([
      (prisma as any).eventAlignmentMeeting.findFirst({ where: { eventId, status: 'in_progress' }, orderBy: { startedAt: 'desc' } }),
      (prisma as any).eventAlignmentMeeting.findFirst({ where: { eventId, status: 'finished' }, orderBy: { endedAt: 'desc' } }),
      buildAlignmentScript(prisma, eventId),
      buildAlignmentContext(prisma, eventId),
      (prisma as any).eventMember.findMany({ where: { eventId }, include: { person: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      success: true,
      meeting: active,
      lastFinished: last ? { id: last.id, endedAt: last.endedAt, summary: last.summary } : null,
      steps,
      summary: summarizeScript(steps),
      context,
      members: members.map((m: any) => ({ personId: m.personId, name: m.person.name, role: m.role })),
    };
  });

  // POST /events/:id/alignment/start — { participants: [{ personId, role }] }
  // Os participantes já devem estar vinculados ao evento (POST /events/:eventId/members); aqui só
  // se confere e se registra a reunião. Só uma reunião em andamento por evento.
  app.post('/events/:id/alignment/start', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;
    const parsed = z.object({ participants: participantsSchema }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' });

    const running = await (prisma as any).eventAlignmentMeeting.findFirst({ where: { eventId, status: 'in_progress' } });
    if (running) return reply.status(409).send({ error: 'Já existe uma reunião de alinhamento em andamento neste evento.', meeting: running });

    const linked = await (prisma as any).eventMember.findMany({ where: { eventId, personId: { in: parsed.data.participants.map(p => p.personId) } }, select: { personId: true } });
    const missing = parsed.data.participants.filter(p => !linked.some((l: any) => l.personId === p.personId));
    if (missing.length) return reply.status(400).send({ error: 'Alguns participantes não estão vinculados às pessoas do evento.' });

    const meeting = await (prisma as any).eventAlignmentMeeting.create({
      data: {
        eventId, startedById: user?.id ?? null, startedByName: user?.name ?? null,
        participants: await participantsSnapshot(eventId, parsed.data.participants),
      },
    });
    await (prisma as any).eventComment.create({
      data: { eventId, userId: null, isSystem: true, content: `Reunião de alinhamento do plano iniciada${user?.name ? ` por ${user.name}` : ''}. Participantes: ${meeting.participants.map((p: any) => `${p.name} (${p.role})`).join(', ')}.` },
    });
    return reply.status(201).send({ success: true, meeting });
  });

  // PATCH /events/:id/alignment/:meetingId — { currentStep?, participants? } (guarda a posição e novos participantes)
  app.patch('/events/:id/alignment/:meetingId', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, meetingId } = request.params as { id: string; meetingId: string };
    const parsed = z.object({ currentStep: z.number().int().min(0).optional(), participants: participantsSchema.optional() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' });
    const meeting = await (prisma as any).eventAlignmentMeeting.findFirst({ where: { id: meetingId, eventId, status: 'in_progress' } });
    if (!meeting) return reply.status(404).send({ error: 'Reunião em andamento não encontrada.' });

    const data: any = {};
    if (parsed.data.currentStep !== undefined) data.currentStep = parsed.data.currentStep;
    if (parsed.data.participants) {
      const linked = await (prisma as any).eventMember.findMany({ where: { eventId, personId: { in: parsed.data.participants.map(p => p.personId) } }, select: { personId: true } });
      if (parsed.data.participants.some(p => !linked.some((l: any) => l.personId === p.personId))) {
        return reply.status(400).send({ error: 'Alguns participantes não estão vinculados às pessoas do evento.' });
      }
      data.participants = await participantsSnapshot(eventId, parsed.data.participants);
    }
    const updated = await (prisma as any).eventAlignmentMeeting.update({ where: { id: meetingId }, data });
    return { success: true, meeting: updated };
  });

  // POST /events/:id/alignment/:meetingId/finish
  app.post('/events/:id/alignment/:meetingId/finish', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, meetingId } = request.params as { id: string; meetingId: string };
    const meeting = await (prisma as any).eventAlignmentMeeting.findFirst({ where: { id: meetingId, eventId, status: 'in_progress' } });
    if (!meeting) return reply.status(404).send({ error: 'Reunião em andamento não encontrada.' });

    const summary = summarizeScript(await buildAlignmentScript(prisma, eventId));
    const updated = await (prisma as any).eventAlignmentMeeting.update({
      where: { id: meetingId }, data: { status: 'finished', endedAt: new Date(), summary },
    });
    const mins = Math.max(1, Math.round((updated.endedAt.getTime() - new Date(meeting.startedAt).getTime()) / 60000));
    await (prisma as any).eventComment.create({
      data: {
        eventId, userId: null, isSystem: true,
        content: `Reunião de alinhamento do plano finalizada (${mins} min). Perguntas respondidas: ${summary.answered}/${summary.total}; pendentes: ${summary.pending}${summary.requiredPending ? ` (${summary.requiredPending} obrigatória(s))` : ''}. Participantes: ${(meeting.participants as any[]).map(p => `${p.name} (${p.role})`).join(', ')}.`,
      },
    });
    return { success: true, meeting: updated, summary };
  });
}
