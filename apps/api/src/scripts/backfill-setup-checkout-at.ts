import { prisma } from '@youdo/db';

async function getUserpToken(): Promise<{ token: string; baseUrl: string }> {
  const rows = await (prisma as any).uerpConfig.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const baseUrl = map['userpBaseUrl'] || '';
  const email = map['userpEmail'] || '';
  const senha = map['userpSenha'] || '';
  if (!baseUrl || !email || !senha) throw new Error('Credenciais Userp não configuradas.');
  const res = await fetch(`${baseUrl}/api/userp-satelite/auth/token.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  if (!res.ok) throw new Error('Falha na autenticação Userp.');
  const data: any = await res.json();
  if (!data.access_token) throw new Error('Token não retornado pelo Userp.');
  return { token: data.access_token, baseUrl };
}

async function fetchContratoDetails(token: string, baseUrl: string, codlocacontrato: number): Promise<any | null> {
  const res = await fetch(`${baseUrl}/api/userp-satelite/experience/contracts-details.php?codlocacontrato=${codlocacontrato}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  let data: any;
  try { data = await res.json(); } catch { return null; }
  if (!data?.success) return null;
  return data?.contracts ?? null;
}

function parseBrt(s: string | null | undefined): Date | null {
  if (!s) return null;
  const iso = s.trim().replace(' ', 'T');
  const d = new Date(`${iso}-03:00`);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const events = await (prisma as any).event.findMany({
    where: {
      OR: [{ setupAt: null }, { checkoutAt: null }],
      AND: [{ OR: [{ teardownAt: { gte: today } }, { startAt: { gte: today } }] }],
    },
    include: { contracts: { orderBy: { createdAt: 'asc' }, select: { id: true, externalId: true } } },
  });

  console.log(`Eventos candidatos (futuros, com setupAt ou checkoutAt em branco): ${events.length}`);

  const { token, baseUrl } = await getUserpToken();

  let updated = 0;
  let skippedNoContract = 0;
  let skippedNoData = 0;
  let errors = 0;

  for (const ev of events) {
    const primary = ev.contracts[0];
    if (!primary?.externalId) { skippedNoContract++; continue; }
    try {
      const detail = await fetchContratoDetails(token, baseUrl, Number(primary.externalId));
      const setupAt = ev.setupAt ? undefined : parseBrt(detail?.main?.data_checkin);
      const checkoutAt = ev.checkoutAt ? undefined : parseBrt(detail?.main?.data_checkout);
      if (!setupAt && !checkoutAt) { skippedNoData++; continue; }
      await (prisma as any).event.update({
        where: { id: ev.id },
        data: { ...(setupAt ? { setupAt } : {}), ...(checkoutAt ? { checkoutAt } : {}) },
      });
      updated++;
      console.log(`OK  ${ev.name}${setupAt ? ` setupAt=${setupAt.toISOString()}` : ''}${checkoutAt ? ` checkoutAt=${checkoutAt.toISOString()}` : ''}`);
    } catch (e: any) {
      errors++;
      console.log(`ERRO ${ev.name} (contrato ${primary.externalId}): ${e.message}`);
    }
  }

  console.log(`\nResumo: ${updated} atualizados, ${skippedNoContract} sem contrato, ${skippedNoData} sem dado novo no UERP, ${errors} erros.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
