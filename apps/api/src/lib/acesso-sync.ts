import { prisma } from '../server.js';
import * as acessosClient from '../services/acessos.js';

// A Acessos guarda um cadastro único por CPF, e toda chamada de grantAccess SUBSTITUI a lista
// inteira de portarias/janelas da pessoa — nunca mescla. Por isso a janela de cada envio precisa
// somar TODOS os compromissos aprovados relevantes da pessoa (não só o que motivou o envio),
// unindo por portaria (menor início, maior fim); do contrário um envio por causa do evento X
// apagava o acesso de um evento Y ainda vigente.
//
// Mas somar sem limite de horizonte também é ruim: alguém com agenda cheia (dezenas de eventos
// aprovados nos próximos meses) ficaria com acesso físico liberado por meses seguidos, sempre
// que o evento mais distante compartilhasse uma portaria com um mais próximo. Por isso só entra
// na conta o que já está rolando ou começa nas próximas WINDOW_HOURS — 48h por padrão, o dobro
// do intervalo do robô diário de ressincronização (workers/acesso-sync.ts), garantindo folga
// mesmo se o robô atrasar um dia inteiro. O robô é quem faz a janela "andar junto" com o
// calendário conforme a data de cada evento se aproxima, sem depender de uma aprovação ou edição
// manual acontecer perto da data.
const WINDOW_HOURS = 48;

export type SyncResult =
  | { attempted: false; reason: string }
  | { attempted: true; status: 'granted' | 'error'; reason?: string };

export async function computeFreelancerAccessMap(
  freelancerId: string,
  windowHours = WINDOW_HOURS,
): Promise<Map<string, { start: Date; end: Date }>> {
  const now = new Date();
  const horizon = new Date(now.getTime() + windowHours * 60 * 60 * 1000);

  const approvedApps = await prisma.freelancerApplication.findMany({
    where: { freelancerId, status: 'approved' },
    select: { eventId: true, role: true },
  });
  if (approvedApps.length === 0) return new Map();

  const eventIds = [...new Set(approvedApps.map(a => a.eventId))];
  const events = await prisma.event.findMany({
    where: { id: { in: eventIds } },
    include: {
      services: { include: { service: { include: { acessoMappings: true } } } },
    },
  });
  const eventById = new Map(events.map((e: any) => [e.id, e]));

  const map = new Map<string, { start: Date; end: Date }>();
  for (const app of approvedApps) {
    const event = eventById.get(app.eventId);
    if (!event) continue;
    const slot = (event as any).services.find((s: any) => s.service.name === app.role);
    if (!slot || !slot.startAt || !slot.endAt || !slot.service.acessoMappings.length) continue;
    if (slot.endAt < now) continue; // compromisso já encerrado
    if (slot.startAt > horizon) continue; // longe demais no futuro — o robô diário pega quando chegar perto

    for (const m of slot.service.acessoMappings as any[]) {
      const existing = map.get(m.acessoId);
      if (!existing) {
        map.set(m.acessoId, { start: slot.startAt, end: slot.endAt });
      } else {
        if (slot.startAt < existing.start) existing.start = slot.startAt;
        if (slot.endAt > existing.end) existing.end = slot.endAt;
      }
    }
  }
  return map;
}

/** Recalcula e reenvia o acesso completo e atual de um freelancer — usado tanto pelo disparo
 *  automático de aprovação/reenvio manual (com applicationId, pro log carregar o contexto de
 *  qual candidatura motivou) quanto pelo robô diário (applicationId nulo — ressincronização
 *  geral, não motivada por uma candidatura específica). */
export async function syncFreelancerAcesso(freelancerId: string, applicationId: string | null): Promise<SyncResult> {
  const freelancer = await prisma.freelancer.findUnique({ where: { id: freelancerId } });
  if (!freelancer) return { attempted: false, reason: 'Freelancer não encontrado.' };

  const accessMap = await computeFreelancerAccessMap(freelancerId);
  if (accessMap.size === 0) {
    return { attempted: false, reason: `Nenhum compromisso vigente ou nas próximas ${WINDOW_HOURS}h com portaria mapeada.` };
  }

  const acessos = [...accessMap.entries()].map(([acessoId, w]) => ({
    acesso_id: acessoId,
    data_inicio: w.start.toISOString().split('T')[0],
    data_fim: w.end.toISOString().split('T')[0],
  }));

  const payload: any = {
    nome: freelancer.name,
    cpf: freelancer.cpf,
    acessos,
  };
  if ((freelancer as any).fotoBase64) {
    payload.foto_base64 = (freelancer as any).fotoBase64;
  }

  let acessoExternoId: string | null = null;
  let status = 'granted';
  let response: any = null;

  try {
    const result = await acessosClient.grantAccess(payload);
    acessoExternoId = result.id;
    response = result;
  } catch (err: any) {
    status = 'error';
    response = { error: err.message };
  }

  await (prisma as any).acessoLog.create({
    data: {
      freelancerId,
      applicationId,
      acessoExternoId,
      status,
      payload,
      response,
    },
  });

  return status === 'granted'
    ? { attempted: true, status: 'granted' }
    : { attempted: true, status: 'error', reason: response?.error };
}
