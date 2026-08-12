'use client';

// Interface do motor de palavra de ativação. Existe porque a escolha atual (Web Speech) é
// explicitamente temporária: ela envia o áudio captado aos servidores do Google enquanto
// escuta. Trocar depois por Porcupine (local, licença paga), openWakeWord (hoje inviável:
// modelos NonCommercial e só inglês) ou um pedal USB deve ser implementar esta interface, não
// refazer a camada de voz.
export interface WakeEngine {
  readonly kind: 'webspeech' | 'porcupine' | 'none';
  /** Começa a escutar. Pode lançar — quem chama trata. */
  start(): Promise<void>;
  /** Para de vez e libera recursos. */
  stop(): void;
  /** Suspende sem liberar — usado no hand-off com o gravador, pra não re-pedir permissão. */
  pause(): void;
  resume(): void;
  readonly listening: boolean;
}

export interface WakeEngineCallbacks {
  onWake: () => void;
  /** Erro permanente (permissão negada): quem chama deve desligar a voz e avisar. */
  onFatal: (message: string) => void;
}

export const NoopWakeEngine: WakeEngine = {
  kind: 'none',
  async start() { /* noop */ },
  stop() { /* noop */ },
  pause() { /* noop */ },
  resume() { /* noop */ },
  listening: false,
};
