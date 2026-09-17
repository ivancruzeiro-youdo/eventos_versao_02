import { prisma } from '../server.js';
import { syncFreelancerAcesso } from '../lib/acesso-sync.js';

// Ressincroniza o acesso de todo freelancer com pelo menos um compromisso aprovado vigente ou
// que começa nas próximas 48h (mesmo horizonte usado dentro de computeFreelancerAccessMap).
// Existe porque a janela só soma o que está dentro desse horizonte — sem este robô, um evento
// aprovado com meses de antecedência só ganharia acesso de fato na Acessos se alguém mexesse
// manualmente na candidatura perto da data (aprovar de novo, reenviar). O robô faz a janela
// "andar junto" com o calendário sozinha. Roda 1x/dia; 48h é o dobro do intervalo entre
// execuções, então mesmo se o robô atrasar um dia inteiro, ninguém chega no evento sem acesso
// já liberado.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const TZ = 'America/Sao_Paulo';
const SYNC_HOUR = 4; // antes do contract-sync (5h), pra não competir por rede/CPU na mesma janela
const WINDOW_HOURS = 48;

let lastRunDate: string | null = null;

function spHourAndDate(d: Date): { hour: number; dateStr: string } {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(d));
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return { hour, dateStr };
}

async function runAcessoSync(log: (msg: string) => void) {
  const now = new Date();
  const horizon = new Date(now.getTime() + WINDOW_HOURS * 60 * 60 * 1000);

  // Turnos vigentes ou que começam nas próximas 48h — mesmo filtro usado dentro de
  // computeFreelancerAccessMap, só que aqui decide QUEM vale a pena reprocessar.
  const relevantSlots = await prisma.eventService.findMany({
    where: { startAt: { lte: horizon }, endAt: { gte: now } },
    select: { eventId: true, service: { select: { name: true } } },
  });
  if (relevantSlots.length === 0) {
    log('acesso-sync: nenhum turno vigente ou nas próximas 48h — nada a fazer hoje.');
    return;
  }

  const eventRoleKeys = new Set(relevantSlots.map(s => `${s.eventId}::${s.service.name}`));
  const candidateApps = await prisma.freelancerApplication.findMany({
    where: { status: 'approved', eventId: { in: [...new Set(relevantSlots.map(s => s.eventId))] } },
    select: { freelancerId: true, eventId: true, role: true },
  });
  const freelancerIds = [...new Set(
    candidateApps
      .filter(a => eventRoleKeys.has(`${a.eventId}::${a.role}`))
      .map(a => a.freelancerId),
  )];

  log(`acesso-sync: ressincronizando ${freelancerIds.length} freelancer(s) com compromisso vigente ou nas próximas ${WINDOW_HOURS}h...`);
  let granted = 0, errors = 0, skipped = 0;
  for (const freelancerId of freelancerIds) {
    try {
      const result = await syncFreelancerAcesso(freelancerId, null);
      if (!result.attempted) skipped++;
      else if (result.status === 'granted') granted++;
      else errors++;
    } catch (err: any) {
      errors++;
      log(`acesso-sync: erro inesperado pro freelancer ${freelancerId} — ${err.message}`);
    }
  }
  log(`acesso-sync: concluído — ${granted} concedido(s), ${errors} erro(s), ${skipped} sem portaria mapeada.`);
}

export function startAcessoSyncScheduler(log: (msg: string) => void = console.log) {
  const check = () => {
    const { hour, dateStr } = spHourAndDate(new Date());
    if (hour !== SYNC_HOUR || lastRunDate === dateStr) return;
    lastRunDate = dateStr; // marca antes de rodar — evita reentrada se demorar mais que o intervalo de checagem
    log(`acesso-sync: iniciando ressincronização diária (${dateStr}, ${SYNC_HOUR}h São Paulo)...`);
    runAcessoSync(log).catch(err => log(`acesso-sync: erro inesperado — ${err.message}`));
  };
  setInterval(check, CHECK_INTERVAL_MS);
  log(`acesso-sync agendado: 1x/dia às ${SYNC_HOUR}h (horário de São Paulo)`);
}
