'use client';

// Um único MediaStream para a sessão inteira, compartilhado pelo gravador e (quando houver)
// pelo detector de palavra de ativação. Re-adquirir por comando custaria 200-400ms e faria o
// indicador de microfone do Chrome piscar toda vez.
import { useCallback, useRef, useState } from 'react';

export type MicError =
  | { kind: 'denied'; message: string }
  | { kind: 'notfound'; message: string }
  | { kind: 'unsupported'; message: string }
  | { kind: 'other'; message: string };

export function useMicStream(onLost?: () => void) {
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<MicError | null>(null);
  const [ready, setReady] = useState(false);

  const acquire = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError({ kind: 'unsupported', message: 'Este navegador não permite usar o microfone.' });
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          // echoCancellation é o que impede a própria fala do sistema de entrar como comando.
          // Só funciona bem quando microfone e alto-falante são o MESMO dispositivo; com PA
          // separado, o portão por isSpeaking() é a única proteção.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Microfone USB arrancado no meio do turno.
      stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        streamRef.current = null;
        setReady(false);
        setError({ kind: 'other', message: 'O microfone foi desconectado.' });
        onLost?.();
      });

      streamRef.current = stream;
      setError(null);
      setReady(true);
      return stream;
    } catch (err: any) {
      const name = err?.name ?? '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        // NUNCA re-tentar automaticamente: o Chrome bloqueia de vez após recusas repetidas.
        setError({ kind: 'denied', message: 'Microfone bloqueado. Libere no ícone do cadeado na barra de endereço.' });
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError({ kind: 'notfound', message: 'Nenhum microfone encontrado neste computador.' });
      } else {
        setError({ kind: 'other', message: err?.message || 'Não foi possível acessar o microfone.' });
      }
      setReady(false);
      return null;
    }
  }, [onLost]);

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  return { acquire, release, ready, error, streamRef };
}
