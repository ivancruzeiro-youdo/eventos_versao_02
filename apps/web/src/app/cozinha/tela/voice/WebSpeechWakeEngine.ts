'use client';

// Detecção da palavra de ativação via Web Speech do navegador.
//
// ATENÇÃO, decisão consciente e temporária: esta API NÃO roda local. O Chrome transmite o
// áudio captado aos servidores do Google enquanto escuta. Em modo contínuo, isso significa a
// conversa da cozinha saindo para terceiro durante todo o turno. Foi aceito por ser uso
// interno e não crítico, com o indicador "ESCUTANDO" sempre visível na tela, e será trocado —
// é por isso que existe a interface WakeEngine.
//
// Só é usada pra DETECTAR a palavra; o comando em si é gravado e transcrito pelo Whisper.
import { normalize } from './match';
import type { WakeEngine, WakeEngineCallbacks } from './WakeEngine';

const WAKE_PATTERNS = [/\bok cozinha\b/, /\bei cozinha\b/, /\boi cozinha\b/, /\bola cozinha\b/];

function getRecognitionCtor(): any | null {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function isWebSpeechAvailable(): boolean {
  return !!getRecognitionCtor();
}

export function createWebSpeechWakeEngine(cb: WakeEngineCallbacks): WakeEngine {
  const Ctor = getRecognitionCtor();
  let rec: any = null;
  // `desired` separado de `running` porque os eventos do Chrome chegam fora de ordem: sem
  // essa distinção, um abort() intencional dispara um restart indesejado.
  let desired: 'listening' | 'paused' | 'off' = 'off';
  let running = false;
  let backoff = 0;
  let watchdog: any = null;
  let lastActivity = Date.now();

  const engine: WakeEngine = {
    kind: 'webspeech',
    get listening() { return desired === 'listening'; },
    async start() {
      if (!Ctor) throw new Error('Este navegador não suporta palavra de ativação. Use o botão.');
      desired = 'listening';
      ensureStarted();
      startWatchdog();
    },
    stop() {
      desired = 'off';
      stopWatchdog();
      try { rec?.abort(); } catch { /* noop */ }
      rec = null;
      running = false;
    },
    pause() {
      if (desired === 'off') return;
      desired = 'paused';
      try { rec?.abort(); } catch { /* noop */ }
    },
    resume() {
      if (desired === 'off') return;
      desired = 'listening';
      ensureStarted();
    },
  };

  function ensureStarted() {
    if (desired !== 'listening' || running) return;
    if (!rec) rec = build();
    try {
      rec.start();
      running = true;
      lastActivity = Date.now();
    } catch {
      // start() num recognizer já iniciado lança InvalidStateError — o onend recoloca no ar.
      running = false;
    }
  }

  function build(): any {
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'pt-BR';
    r.maxAlternatives = 1;

    r.onresult = (ev: any) => {
      lastActivity = Date.now();
      // Resultados parciais: a ativação tem que disparar antes de a pessoa terminar a frase.
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const text = normalize(ev.results[i][0]?.transcript ?? '');
        if (text && WAKE_PATTERNS.some(p => p.test(text))) {
          cb.onWake();
          return;
        }
      }
    };

    r.onerror = (ev: any) => {
      lastActivity = Date.now();
      const code = ev?.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        // Permanente: NUNCA entrar em loop nisso.
        desired = 'off';
        stopWatchdog();
        cb.onFatal('Microfone bloqueado para escuta contínua. Use o botão ou libere a permissão.');
        return;
      }
      if (code === 'network') {
        backoff = Math.min(backoff ? backoff * 2 : 2000, 15000);
        return;
      }
      // no-speech e aborted são normais em escuta contínua.
      backoff = 0;
    };

    // Reinício vive AQUI e só aqui: onerror é sempre seguido de onend, então reiniciar nos
    // dois lugares dispara dois start() e o segundo lança InvalidStateError.
    r.onend = () => {
      running = false;
      if (desired !== 'listening') return;
      const delay = backoff || 250;
      setTimeout(() => ensureStarted(), delay);
    };

    return r;
  }

  function startWatchdog() {
    stopWatchdog();
    // O Chrome emudece silenciosamente depois de horas — sem evento nenhum, nem erro. Um
    // quiosque de cozinha fica semanas ligado, então isso acontece.
    watchdog = setInterval(() => {
      if (desired !== 'listening') return;
      if (Date.now() - lastActivity < 60_000) return;
      lastActivity = Date.now();
      try { rec?.abort(); } catch { /* noop */ }
      running = false;
      rec = null;
      ensureStarted();
    }, 20_000);
  }

  function stopWatchdog() {
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
  }

  return engine;
}
