// Envio de WhatsApp via o mesmo fluxo n8n usado por activity-alerts.ts — extraído pra
// lib/ pra ser reutilizável por qualquer rota (ex.: notificação de time ao criar/editar
// uma atividade de cronograma), não só pelo worker de atrasos.
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.youdobrasil.com.br/webhook/ENVIAR_MSG';

// O fluxo n8n prefixa "+55" — enviar apenas DDD + número (dígitos, sem código do país)
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
  if (digits.length < 10) return null;
  return digits;
}

export async function sendWhatsAppAlert(phone: string, mensagem: string): Promise<boolean> {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fone: phone, mensagem }),
    });
    return res.ok;
  } catch (err: any) {
    console.error(`Erro ao chamar webhook do WhatsApp (${phone}):`, err.message);
    return false;
  }
}
