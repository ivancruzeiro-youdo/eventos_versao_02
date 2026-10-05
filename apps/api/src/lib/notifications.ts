// Envio de WhatsApp via YouDoChat (inbox Avisos Oficial) — usado tanto pelo worker de atividades
// atrasadas (workers/activity-alerts.ts) quanto pela notificação de time ao criar/editar
// uma atividade de cronograma (routes/schedules.ts). Antes ia por um webhook n8n; ver
// lib/youdochat.ts pro wrapper cru da API.
import { sendWhatsAppTemplate, YOUDOCHAT_INBOX } from './youdochat.js';

// YouDoChat quer DDI (55) + DDD + número — a API remove não-dígitos por conta própria,
// mas precisa do código do país presente (o fluxo n8n antigo adicionava "+55" do lado dele).
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (!digits.startsWith('55')) digits = `55${digits}`;
  return digits;
}

// A Meta recusa valor de template vazio, com quebra de linha/tab ou com 4+ espaços seguidos,
// e o corpo montado não passa de 1024 caracteres (~950 por valor).
function templateValue(text: string): string {
  const v = text.replace(/\s+/g, ' ').trim().slice(0, 900);
  return v || '—';
}

export interface AlertParts {
  titulo: string;   // {{1}} — destaque em negrito do aviso
  detalhe: string;  // {{2}} — contexto (evento, horário, time…)
  acao: string;     // {{3}} — o que fazer / informação final
}

// Sempre pelo YouDoChat, inbox Avisos Oficial (API oficial): o aviso começa a conversa, então
// fora da janela de 24h só o template aprovado `aviso_youdo_3` é entregue — por isso o alerta é
// estruturado em 3 partes em vez de texto livre.
export async function sendWhatsAppAlert(phone: string, parts: AlertParts): Promise<boolean> {
  try {
    await sendWhatsAppTemplate(
      phone,
      { name: 'aviso_youdo_3', language: 'pt_BR', valores: [templateValue(parts.titulo), templateValue(parts.detalhe), templateValue(parts.acao)] },
      { inboxId: YOUDOCHAT_INBOX.avisosOficial, agentName: 'Avisos Automáticos' }
    );
    return true;
  } catch (err: any) {
    console.error(`Erro ao enviar WhatsApp via YouDoChat (${phone}):`, err.message);
    return false;
  }
}
