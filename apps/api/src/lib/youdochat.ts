// Thin wrapper around the YouDoChat send-message-api (WhatsApp), mirroring lib/s3.ts's
// style: an env-var guard, one small exported async function, no client class.
// Replaces the old ad-hoc n8n webhook call (workers/activity-alerts.ts used to POST
// straight to https://n8n.youdobrasil.com.br/webhook/ENVIAR_MSG) now that the company
// runs its own chat system instead of routing outbound WhatsApp through n8n/Chatwoot.
// See the vendor doc "COMO_USAR_API_ENVIO.md" for the full API reference.

const SEND_MESSAGE_URL = 'https://chat.youdobrasil.com.br/functions/v1/send-message-api';

// Inboxes documented in COMO_USAR_API_ENVIO.md §5 — named so call sites pick by intent
// ("avisos" for automated alerts/notices) instead of pasting a raw UUID inline.
export const YOUDOCHAT_INBOX = {
  wppApiNaoOficial: 'f4292ff9-b0b0-449a-a9c5-a784c3c18f00', // Evolution — default if inbox_id omitted
  avisos: 'debfb6c3-c501-456c-8771-b3223d62569e',           // Evolution — automated notices/alerts
  wppOficialIA: 'd0e8800a-bf8e-4cf7-a7fd-8d8308489322',     // Meta Cloud — respects the 24h window
  wpOficial: '618077ce-c873-4e60-8709-337e4d2a8388',        // Meta Cloud — respects the 24h window
} as const;

function getApiKey(): string {
  const key = process.env.YOUDOCHAT_API_KEY;
  if (!key) throw new Error('YOUDOCHAT_API_KEY não configurado no ambiente.');
  return key;
}

export interface SendWhatsAppResult {
  conversationId: string;
  contactId: string;
}

// Phone must include DDI (55) + DDD + number — the API strips non-digits itself, but
// without the 55 prefix the message silently fails to deliver (per the vendor doc).
export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  options: { inboxId?: string; agentName?: string } = {}
): Promise<SendWhatsAppResult> {
  const res = await fetch(SEND_MESSAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
    },
    body: JSON.stringify({
      phone,
      message,
      ...(options.inboxId ? { inbox_id: options.inboxId } : {}),
      ...(options.agentName ? { agent_name: options.agentName } : {}),
    }),
  });

  const data = await res.json().catch(() => ({}) as any);
  if (!res.ok) {
    throw new Error(`YouDoChat send-message-api falhou: HTTP ${res.status} — ${data.error || JSON.stringify(data)}`);
  }
  return { conversationId: data.conversation_id, contactId: data.contact_id };
}
