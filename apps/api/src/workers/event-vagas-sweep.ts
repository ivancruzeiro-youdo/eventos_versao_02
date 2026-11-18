import { prisma } from '../server.js';
import { sweepCancelledEvents } from '../lib/event-vagas.js';

// Rede de segurança (a cada 5 min): evento cancelado por qualquer caminho que não passou por
// cancelEventVagas (SQL manual, sync, código futuro) tem as vagas e candidaturas canceladas
// aqui, com aviso por WhatsApp aos freelancers. Ver lib/event-vagas.ts.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
let running = false;

export function startEventVagasSweep(log: (msg: string) => void = console.log) {
  const check = async () => {
    if (running) return;
    running = true;
    try {
      const r = await sweepCancelledEvents(prisma, { notify: true, log });
      if (r.services || r.applications) log(`event-vagas: varredura cancelou ${r.services} vaga(s) e ${r.applications} candidatura(s) de eventos cancelados, ${r.notified} avisado(s)`);
    } catch (err: any) {
      log(`event-vagas: erro na varredura — ${err.message}`);
    } finally { running = false; }
  };
  setInterval(check, CHECK_INTERVAL_MS);
  log('event-vagas agendado: varredura de eventos cancelados com vagas ativas (a cada 5 min)');
}
