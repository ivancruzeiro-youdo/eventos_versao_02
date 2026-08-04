// Envio de WhatsApp via YouDoChat (inbox AVISOS) — usado tanto pelo worker de atividades
// atrasadas (workers/activity-alerts.ts) quanto pela notificação de time ao criar/editar
// uma atividade de cronograma (routes/schedules.ts). Antes ia por um webhook n8n; ver
// lib/youdochat.ts pro wrapper cru da API.
import { sendWhatsAppMessage, YOUDOCHAT_INBOX } from './youdochat.js';

// YouDoChat quer DDI (55) + DDD + número — a API remove não-dígitos por conta própria,
// mas precisa do código do país presente (o fluxo n8n antigo adicionava "+55" do lado dele).
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (!digits.startsWith('55')) digits = `55${digits}`;
  return digits;
}

export async function sendWhatsAppAlert(phone: string, mensagem: string): Promise<boolean> {
  try {
    await sendWhatsAppMessage(phone, mensagem, { inboxId: YOUDOCHAT_INBOX.avisos, agentName: 'Avisos Automáticos' });
    return true;
  } catch (err: any) {
    console.error(`Erro ao enviar WhatsApp via YouDoChat (${phone}):`, err.message);
    return false;
  }
}
