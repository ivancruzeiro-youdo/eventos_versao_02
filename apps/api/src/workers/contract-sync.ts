import { prisma } from '../server.js';

// Roda a mesma sincronização de contratos Userp que hoje é feita manualmente (botão "Sync" em
// /events) — mas só a parte que já é segura pra automatizar: cria/atualiza eventos com base nos
// previews sem pendência (canImport=true). Eventos com pendência (produto não mapeado, produto
// de equipe sem serviço vinculado, etc.) continuam de fora — precisam de alguém revisar e
// importar manualmente pela tela, exatamente como hoje. Reaproveita os endpoints reais via
// app.inject() em vez de duplicar a lógica de sync-preview/sync-import, pra nunca divergir do
// que a sincronização manual faz.
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // verifica a cada 5 min se já é hora de rodar
const TZ = 'America/Sao_Paulo';
const SYNC_HOUR = 5; // 05h no horário de São Paulo

let lastRunDate: string | null = null; // "YYYY-MM-DD" em SP — evita rodar 2x no mesmo dia

function spHourAndDate(d: Date): { hour: number; dateStr: string } {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(d));
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return { hour, dateStr };
}

async function runContractSync(app: any, log: (msg: string) => void) {
  // Não existe usuário "sistema" dedicado — usa o admin mais antigo (conta genérica), só pra
  // satisfazer o requireAuth dos endpoints e deixar rastro correto em triggeredBy/comentários.
  const systemUser = await (prisma as any).user.findFirst({
    where: { role: 'admin' },
    orderBy: { createdAt: 'asc' },
  });
  if (!systemUser?.employerId) {
    log('contract-sync: nenhum usuário admin com employerId encontrado — sincronização automática abortada.');
    return;
  }

  const token = app.jwt.sign(
    { sub: systemUser.id, role: systemUser.role, email: systemUser.email, employerId: systemUser.employerId },
    { expiresIn: '10m' },
  );

  const previewRes = await app.inject({ method: 'POST', url: '/api/v2/events/sync-preview', cookies: { token } });
  if (previewRes.statusCode !== 200) {
    log(`contract-sync: sync-preview falhou (${previewRes.statusCode}) — ${previewRes.body}`);
    return;
  }
  const { previews } = previewRes.json() as { previews: any[] };
  const importable = previews.filter((p: any) => p.canImport);
  log(
    `contract-sync: ${previews.length} evento(s) no preview, ${importable.length} importado(s) automaticamente, ` +
    `${previews.length - importable.length} com pendência (segue exigindo revisão manual em /events).`,
  );

  if (importable.length === 0) return;

  const importRes = await app.inject({
    method: 'POST',
    url: '/api/v2/events/sync-import',
    cookies: { token },
    payload: { previews: importable },
  });
  if (importRes.statusCode !== 200) {
    log(`contract-sync: sync-import falhou (${importRes.statusCode}) — ${importRes.body}`);
    return;
  }
  const { results } = importRes.json() as { results: any[] };
  log(`contract-sync: concluído — ${results.length} evento(s) processado(s).`);
}

export function startContractSyncScheduler(app: any, log: (msg: string) => void = console.log) {
  const check = () => {
    const { hour, dateStr } = spHourAndDate(new Date());
    if (hour !== SYNC_HOUR || lastRunDate === dateStr) return;
    lastRunDate = dateStr; // marca antes de rodar — evita reentrada se demorar mais que o intervalo de checagem
    log(`contract-sync: iniciando sincronização automática diária (${dateStr}, ${SYNC_HOUR}h São Paulo)...`);
    runContractSync(app, log).catch(err => log(`contract-sync: erro inesperado — ${err.message}`));
  };
  setInterval(check, CHECK_INTERVAL_MS);
  log(`contract-sync agendado: 1x/dia às ${SYNC_HOUR}h (horário de São Paulo)`);
}
