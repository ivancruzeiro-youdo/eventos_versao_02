'use client';

// Assina o stream de mudanças dos eventos abertos na tela: quando outro PC mexe na sequência,
// esta tela recarrega na hora em vez de esperar o poll.
//
// EventSource e não WebSocket: o fluxo é só servidor→cliente, o navegador reconecta sozinho
// quando cai, e não precisa de dependência nova. Como manda cookie em requisição de mesma
// origem, a autenticação por cookie da sessão funciona sem nada extra.
import { useEffect, useRef, useState } from 'react';

interface Opts {
  /** Ids de evento a acompanhar (um por coluna). */
  eventIds: string[];
  /** Chamado quando algo mudou naquele evento. */
  onChange: (eventId: string) => void;
  enabled?: boolean;
}

export function useKitchenStream({ eventIds, onChange, enabled = true }: Opts) {
  const [live, setLive] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Ordena pra chave estável: mudar a ordem das colunas não deve derrubar e reabrir tudo.
  const key = [...eventIds].filter(Boolean).sort().join(',');

  useEffect(() => {
    if (!enabled || !key) { setLive(false); return; }

    const ids = key.split(',');
    const sources: EventSource[] = [];
    let openCount = 0;

    for (const eventId of ids) {
      const es = new EventSource(`/api/v2/kitchen/display/events/${eventId}/stream`, {
        withCredentials: true,
      });

      es.addEventListener('hello', () => {
        openCount++;
        setLive(true);
      });

      const handle = () => onChangeRef.current(eventId);
      es.addEventListener('plan-changed', handle);
      es.addEventListener('prep-changed', handle);

      // O EventSource já reconecta sozinho (o servidor manda `retry`), então aqui só marcamos
      // que não está ao vivo — o poll continua rodando como rede de segurança e a tela nunca
      // fica presa em dado velho por causa de um stream morto.
      es.onerror = () => {
        openCount = Math.max(0, openCount - 1);
        if (openCount === 0) setLive(false);
      };

      sources.push(es);
    }

    return () => {
      for (const es of sources) es.close();
      setLive(false);
    };
  }, [key, enabled]);

  return { live };
}
