'use client';

// Bipes e fala. Tudo sintetizado: não existe nenhum asset de áudio no projeto (public/ tem só
// o logo), e um bipe gerado é mais confiável que um arquivo que pode faltar no deploy.

let ctx: AudioContext | null = null;
let ttsVoice: SpeechSynthesisVoice | null = null;
let volume = 0.12;

/** Deve ser chamado DENTRO do gesto que liga a voz: destrava AudioContext, TTS e (na
 *  sequência) a permissão de microfone de uma vez só. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new AC();
    }
    void ctx.resume();
  } catch { /* sem áudio: a tela ainda funciona por texto */ }

  try {
    pickVoice();
    // Fala vazia dentro do gesto: é o que destrava speechSynthesis no Safari/iOS.
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch { /* idem */ }
}

/** Chrome suspende o AudioContext com a aba oculta e o quiosque volta mudo. */
export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
}

function tone(freq: number, ms: number, delayMs = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  // Envelope em rampa: corte seco estala, e num alto-falante de cozinha estalo parece defeito.
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + ms / 1000 + 0.02);
}

/** O áudio só existe depois de um gesto do usuário (exigência do navegador). A tela usa isso
 *  pra avisar que os alertas de atraso vão sair só no visual até alguém ativar o som. */
export function isAudioUnlocked(): boolean {
  return !!ctx && ctx.state !== 'closed';
}

export type Beep = 'open' | 'close' | 'ok' | 'error' | 'confirm' | 'ignored' | 'late' | 'critical';

export function beep(kind: Beep) {
  resumeAudio();
  switch (kind) {
    case 'open':    tone(880, 90); break;
    case 'close':   tone(660, 70); break;
    case 'ok':      tone(660, 80); tone(990, 80, 90); break;
    case 'error':   tone(300, 220); break;
    // Atraso: dois tons ASCENDENTES e agudos, timbre distinto de tudo o mais — tem que cortar
    // ruído de cozinha e não ser confundido com confirmação de comando.
    case 'late':     tone(1180, 120); tone(1480, 140, 150); break;
    // Crítico: sequência de três, repetida, deliberadamente incômoda.
    case 'critical':
      tone(1480, 130); tone(1180, 130, 160); tone(1480, 130, 320);
      tone(1480, 130, 620); tone(1180, 130, 780); tone(1480, 180, 940);
      break;
    // Grave duplo, deliberadamente diferente de tudo: é o som de "vou apagar algo".
    case 'confirm': tone(520, 110); tone(520, 110, 170); break;
    // Ativação sem comando tem que ser quase invisível — se falso disparo for barulhento e
    // falante, a equipe desliga a voz no primeiro turno.
    case 'ignored': tone(240, 60); break;
  }
}

function pickVoice() {
  try {
    const vs = window.speechSynthesis.getVoices();
    ttsVoice = vs.find(v => v.lang === 'pt-BR') ?? vs.find(v => v.lang?.startsWith('pt')) ?? null;
  } catch { ttsVoice = null; }
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  // getVoices() volta vazio na primeira chamada no Chrome — a lista chega por evento.
  pickVoice();
  window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
}

/** True enquanto o TTS está falando. O controlador usa isso pra bloquear gravação e ativação
 *  — sem esse portão, a própria fala do sistema é captada e vira o próximo comando. */
export function isSpeaking(): boolean {
  try { return window.speechSynthesis.speaking; } catch { return false; }
}

export function speak(text: string, onDone?: () => void) {
  if (!text) { onDone?.(); return; }
  try {
    const synth = window.speechSynthesis;
    // Chrome às vezes trava em `paused`; resume antes de cada fala.
    if (synth.paused) synth.resume();
    synth.cancel(); // nunca enfileirar: o último aviso é o único que importa

    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    if (ttsVoice) u.voice = ttsVoice;
    u.rate = 1.05;
    u.onend = () => onDone?.();
    u.onerror = () => onDone?.();
    synth.speak(u);
  } catch {
    onDone?.();
  }
}

export function stopSpeaking() {
  try { window.speechSynthesis.cancel(); } catch { /* noop */ }
}
