import { prisma } from '../server.js';
import { runVagaReminders } from '../lib/vaga-reminders.js';

// Checa a cada 5 min as vagas que começam em até 12h e manda o lembrete (ver lib/vaga-reminders.ts).
// Sem restrição de horário útil: o lembrete é relativo ao início do turno, que pode ser de madrugada.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
let running = false;

export function startVagaReminders(log: (msg: string) => void = console.log) {
  const check = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runVagaReminders(prisma, { log });
      if (r.sent || r.failed || r.noPhone) log(`vaga-reminders: ${r.sent} enviados, ${r.failed} falhas, ${r.noPhone} sem telefone`);
    } catch (err: any) {
      log(`vaga-reminders: erro — ${err.message}`);
    } finally { running = false; }
  };
  setInterval(check, CHECK_INTERVAL_MS);
  log(`vaga-reminders agendado: lembrete ${12}h antes do início da vaga (checagem a cada 5 min)`);
}
