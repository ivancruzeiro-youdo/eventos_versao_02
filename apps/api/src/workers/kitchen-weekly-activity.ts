import { prisma } from '../server.js';
import { spHourAndDate } from '../lib/pendency-alerts.js';
import { createKitchenWeeklyActivity } from '../lib/kitchen-weekly-activity.js';

// Toda segunda-feira (a partir das 08h de São Paulo) cria a atividade "Adicionar mão de obra
// cozinha" pra equipe Cozinha no evento mais próximo. A rodada da semana é reservada no AuditLog
// antes de criar, então reinício da API não duplica.
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const START_HOUR = 8;

export function startKitchenWeeklyActivity(log: (msg: string) => void = console.log) {
  const check = async () => {
    const now = new Date();
    const { hour, dateStr } = spHourAndDate(now);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(now);
    if (weekday !== 'Mon' || hour < START_HOUR) return;
    try {
      const done = await (prisma as any).auditLog.findFirst({ where: { action: 'kitchen_weekly_activity', entityId: dateStr }, select: { id: true } });
      if (done) return;
      await (prisma as any).auditLog.create({ data: { action: 'kitchen_weekly_activity', entityType: 'system', entityId: dateStr } });
      const msg = await createKitchenWeeklyActivity(prisma, dateStr);
      log(`kitchen-weekly-activity: ${msg}`);
    } catch (err: any) {
      log(`kitchen-weekly-activity: erro — ${err.message}`);
    }
  };
  setInterval(check, CHECK_INTERVAL_MS);
  log('kitchen-weekly-activity agendado: segundas a partir das 08h (horário de São Paulo)');
}
