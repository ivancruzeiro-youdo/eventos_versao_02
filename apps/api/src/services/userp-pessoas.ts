import { prisma } from '../server.js';
import { getUserpToken } from '../lib/userp-auth.js';
import { getS3ObjectBuffer } from '../lib/s3.js';

// Vincula uma Pessoa do Evento (EventMember) à Userp quando ela é adicionada a um evento —
// cria/localiza o usuário lá (por CPF) e associa ao contrato do evento, sem liberar acesso
// automático (acessar_app/acessar_unidade = '0'; decisão de produto — só cadastro + foto por
// enquanto). Fire-and-forget (mesmo padrão de userp-checkin.ts): nunca atrasa nem bloqueia o
// fluxo de adicionar a pessoa na tela; o resultado sempre vira comentário de sistema no evento.
export async function registrarPessoaUserp(personId: string, eventId: string, triggeredByUserId: string | null): Promise<void> {
  const person = await (prisma as any).person.findUnique({ where: { id: personId } });
  if (!person) return;

  const lines: string[] = [];

  if (!person.cpf) {
    lines.push(`"${person.name}": sem CPF cadastrado — a Userp exige CPF pra vincular, não foi possível registrar.`);
    return logComment(eventId, triggeredByUserId, lines);
  }

  // Contrato principal do evento — mesma convenção usada em userp-checkin.ts e sync-events.ts
  // (primeiro contrato criado é o principal; secundários não têm "usuário" próprio aqui).
  const contract = await (prisma as any).eventContract.findFirst({ where: { eventId }, orderBy: { createdAt: 'asc' } });
  if (!contract) {
    lines.push(`"${person.name}": este evento não tem contrato Userp vinculado — nada a fazer.`);
    return logComment(eventId, triggeredByUserId, lines);
  }

  let token: string, baseUrl: string;
  try {
    ({ token, baseUrl } = await getUserpToken());
  } catch (err: any) {
    lines.push(`"${person.name}": erro de autenticação com a Userp — ${err.message}`);
    return logComment(eventId, triggeredByUserId, lines);
  }

  let usuarioId: number | null = person.userpUsuarioId ?? null;
  try {
    const res = await fetch(`${baseUrl}/api/userp-satelite/contratos/usuarios/create.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        nome: person.name,
        cpf: person.cpf,
        contrato_id: Number(contract.externalId),
        acessar_app: '0',
        acessar_unidade: '0',
        ...(person.whatsapp ? { fone: person.whatsapp } : {}),
        ...(usuarioId ? { usuario_id: usuarioId } : {}),
      }),
    });

    if (res.status === 409) {
      lines.push(`"${person.name}": já estava vinculada ao contrato ${contract.externalId} na Userp.`);
    } else if (!res.ok) {
      const body = await res.text().catch(() => '');
      lines.push(`"${person.name}": falha ao vincular ao contrato ${contract.externalId} na Userp (${res.status}) — ${body}`);
      return logComment(eventId, triggeredByUserId, lines);
    } else {
      const data: any = await res.json();
      if (data.usuario_id) usuarioId = data.usuario_id;
      lines.push(`"${person.name}": vinculada ao contrato ${contract.externalId} na Userp (usuario_id ${usuarioId}).`);
    }
  } catch (err: any) {
    lines.push(`"${person.name}": erro ao vincular na Userp — ${err.message}`);
    return logComment(eventId, triggeredByUserId, lines);
  }

  if (usuarioId && usuarioId !== person.userpUsuarioId) {
    await (prisma as any).person.update({ where: { id: personId }, data: { userpUsuarioId: usuarioId } });
  }

  if (usuarioId && person.photoUrl) {
    try {
      const buffer = await getS3ObjectBuffer(person.photoUrl);
      const res = await fetch(`${baseUrl}/api/userp-satelite/usuarios/update-foto.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ usuario_id: usuarioId, usuario_foto: buffer.toString('base64') }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        lines.push(`"${person.name}": foto não atualizada na Userp (${res.status}) — ${body}`);
      } else {
        lines.push(`"${person.name}": foto atualizada na Userp.`);
      }
    } catch (err: any) {
      lines.push(`"${person.name}": erro ao enviar foto pra Userp — ${err.message}`);
    }
  }

  return logComment(eventId, triggeredByUserId, lines);
}

async function logComment(eventId: string, userId: string | null, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  await prisma.eventComment.create({
    data: { eventId, userId, isSystem: true, content: `Vínculo Userp (Pessoas do Evento):\n${lines.join('\n')}` },
  });
}
