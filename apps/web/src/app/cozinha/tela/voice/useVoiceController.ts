'use client';

// Máquina de estados da voz: liga o microfone, grava, transcreve, interpreta, resolve o alvo,
// executa — e para tudo e pergunta quando não tem certeza.
//
// Princípio que atravessa o arquivo: na dúvida NÃO age. Um comando perdido custa uma
// repetição; um comando errado numa cozinha em serviço custa comida errada na mesa, e o
// caminho de remover custa trabalho apagado.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ServiceCommands } from '../useServiceCommands';
import type { ServiceEntry } from '../ServicePanel';
import { parseIntent, SPEECH, type Intent, type Mode } from './grammar';
import { matchBest, parseOrdinal, mentionsNext, ACCEPT_THRESHOLD } from './match';
import { beep, speak, unlockAudio, resumeAudio, isSpeaking, stopSpeaking } from './feedback';
import { useMicStream } from './useMicStream';
import { useRecorder } from './useRecorder';
import { createWebSpeechWakeEngine, isWebSpeechAvailable } from './WebSpeechWakeEngine';
import { NoopWakeEngine, type WakeEngine } from './WakeEngine';

export type VoiceMode = 'off' | 'ptt' | 'wake';
export type VoiceState =
  | 'off' | 'idle' | 'gravando' | 'transcrevendo' | 'executando' | 'confirmando' | 'desambiguando';

export interface PendingRemoval {
  venueId: string;
  entryId: string;
  label: string;
  timeLabel: string;
}

export interface Choice {
  label: string;
  run: () => void;
}

interface Opts {
  mode: Mode;
  /** Espaços visíveis, na ordem das colunas. */
  venues: { id: string; name: string }[];
  /** Coluna em foco — alvo padrão quando há mais de uma. */
  focusVenueId: string | null;
  getCommands: (venueId: string) => ServiceCommands | undefined;
  /** Modo semana: marcar item como produzido. */
  onPrepCheck: (venueId: string, itemName: string) => Promise<void>;
  /** Nomes disponíveis para check no modo semana, por espaço. */
  getWeekItems: (venueId: string) => { itemName: string; eventItemId: string | null }[];
  onRefresh: () => void;
  /** Permitir REMOVER por voz. Desligado por padrão. */
  allowRemove: boolean;
}

const CONFIRM_TIMEOUT_MS = 8000;

export function useVoiceController(opts: Opts) {
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('off');
  const [state, setState] = useState<VoiceState>('off');
  const [transcript, setTranscript] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PendingRemoval | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [availableReason, setAvailableReason] = useState<string | null>(null);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const wakeRef = useRef<WakeEngine>(NoopWakeEngine);
  const stateRef = useRef<VoiceState>('off');
  stateRef.current = state;
  const pendingRef = useRef<PendingRemoval | null>(null);
  pendingRef.current = pending;
  const confirmTimer = useRef<any>(null);
  const confirmRetried = useRef(false);
  const lastCall = useRef(0);

  const onMicLost = useCallback(() => {
    beep('error');
    setVoiceMode('off');
    setState('off');
  }, []);

  const mic = useMicStream(onMicLost);
  const recorder = useRecorder(mic.streamRef);

  // ── Disponibilidade (chave da OpenAI) ────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/v2/kitchen/display/voice/status', { credentials: 'include' });
        if (!res.ok) throw new Error();
        const d = await res.json();
        if (!alive) return;
        setAvailable(!!d.enabled);
        setAvailableReason(d.reason ?? null);
      } catch {
        if (alive) { setAvailable(false); setAvailableReason('Não foi possível verificar o serviço de voz.'); }
      }
    })();
    return () => { alive = false; };
  }, []);

  // Chrome suspende o AudioContext com a aba oculta e o quiosque volta mudo.
  useEffect(() => {
    const onVis = () => {
      resumeAudio();
      if (document.hidden) wakeRef.current.pause();
      else if (voiceMode === 'wake') wakeRef.current.resume();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [voiceMode]);

  const say = useCallback((text: string) => {
    setMessage(text);
    speak(text);
  }, []);

  // ── Resolução do alvo ────────────────────────────────────────────────────

  /** Cadeia: espaço dito na fala → coluna em foco → único espaço → nada. */
  const resolveVenue = useCallback((spoken: string, requireExplicit: boolean): string | null => {
    const { venues, focusVenueId } = optsRef.current;
    if (venues.length === 1) return venues[0].id;

    const m = matchBest(spoken, venues.map(v => ({ value: v.id, text: v.name })));
    if (m.best && !m.ambiguous) return m.best;

    if (!requireExplicit && focusVenueId) return focusVenueId;
    return null;
  }, []);

  /** Ordinal e "o próximo" primeiro: são à prova de ruído e sem risco de casar item errado. */
  const resolveEntry = useCallback((
    target: string,
    entries: ServiceEntry[],
  ): { entry: ServiceEntry | null; ambiguousWith: ServiceEntry[] } => {
    const pendingEntries = entries.filter(e => e.status !== 'served');

    if (mentionsNext(target) && pendingEntries.length > 0) {
      return { entry: pendingEntries[0], ambiguousWith: [] };
    }
    const ord = parseOrdinal(target);
    if (ord !== null) {
      const list = pendingEntries.length > 0 ? pendingEntries : entries;
      const entry = ord === -1 ? list[list.length - 1] : list[ord];
      return { entry: entry ?? null, ambiguousWith: [] };
    }

    // Sem alvo dito: só vale quando há exatamente uma saída pendente — senão adivinharia.
    if (!target.trim()) {
      return { entry: pendingEntries.length === 1 ? pendingEntries[0] : null, ambiguousWith: [] };
    }

    const m = matchBest(target, entries.map(e => ({ value: e, text: e.itemName })));
    if (m.ambiguous) {
      return { entry: null, ambiguousWith: m.ranked.slice(0, 2).map(r => r.value) };
    }
    if (!m.best) {
      return { entry: null, ambiguousWith: m.ranked.filter(r => r.score > 0).slice(0, 3).map(r => r.value) };
    }

    // Mesmo nome duas vezes (item duplicado, round 2+): a ambiguidade é de INSTÂNCIA, não de
    // nome — o matcher não resolveria. Default para a primeira não servida.
    const sameName = entries.filter(e => e.itemName === m.best!.itemName);
    if (sameName.length > 1) {
      const firstPending = sameName.find(e => e.status !== 'served');
      return { entry: firstPending ?? sameName[0], ambiguousWith: [] };
    }
    return { entry: m.best, ambiguousWith: [] };
  }, []);

  // ── Execução ─────────────────────────────────────────────────────────────

  const clearConfirm = useCallback(() => {
    if (confirmTimer.current) { clearTimeout(confirmTimer.current); confirmTimer.current = null; }
    confirmRetried.current = false;
    setPending(null);
  }, []);

  const finish = useCallback((ok: boolean, text?: string) => {
    beep(ok ? 'ok' : 'error');
    if (text) say(text);
    setState('idle');
  }, [say]);

  const runIntent = useCallback(async (intent: Intent, target: string, raw: string, count: number) => {
    const o = optsRef.current;

    // Globais não precisam de alvo.
    if (intent === 'ATUALIZAR') { o.onRefresh(); finish(true, 'atualizando'); return; }
    if (intent === 'PARAR') { stopSpeaking(); setChoices([]); clearConfirm(); setState('idle'); beep('close'); return; }
    if (intent === 'DESLIGAR_MIC') { setVoiceMode('off'); beep('close'); say('microfone desligado'); return; }

    const needsExplicitVenue = intent === 'REMOVER';
    const venueId = resolveVenue(raw, needsExplicitVenue);
    if (!venueId) {
      const names = o.venues.map(v => v.name).join(' ou ');
      finish(false, `${SPEECH.whichVenue}: ${names}`);
      return;
    }
    const venueName = o.venues.find(v => v.id === venueId)?.name ?? '';
    const multi = o.venues.length > 1;
    const withVenue = (t: string) => (multi ? `${venueName}, ${t}` : t);

    // ── Modo semana: só marcar produzido ──
    if (o.mode === 'semana') {
      if (intent !== 'PRODUZIDO') { finish(false, 'na visão da semana só dá pra marcar produzido'); return; }
      const items = o.getWeekItems(venueId);
      const m = matchBest(target, items.map(i => ({ value: i, text: i.itemName })));
      if (m.ambiguous) {
        setChoices(m.ranked.slice(0, 3).map(r => ({
          label: r.text,
          run: () => { void o.onPrepCheck(venueId, r.value.itemName); setChoices([]); },
        })));
        finish(false, SPEECH.which);
        return;
      }
      if (!m.best) { setChoices([]); finish(false, SPEECH.itemNotFound); return; }
      setState('executando');
      await o.onPrepCheck(venueId, m.best.itemName);
      finish(true, withVenue(`${m.best.itemName} ${SPEECH.produced}`));
      return;
    }

    // ── Modo dia: sequência de serviço ──
    const cmd = o.getCommands(venueId);
    if (!cmd) { finish(false, 'nenhum evento carregado nesse espaço'); return; }

    if (intent === 'GERAR') {
      setState('executando');
      const r = await cmd.generateSuggested();
      finish(r.ok, r.ok ? 'sequência gerada' : r.error);
      return;
    }

    const { entry, ambiguousWith } = resolveEntry(target, cmd.entries);

    if (!entry) {
      if (ambiguousWith.length > 0) {
        // Oferece as alternativas como botões: um toque resolve melhor que repetir a frase.
        setChoices(ambiguousWith.map(e => ({
          label: `${e.itemName}`,
          run: () => { setChoices([]); void applyTo(intent, e, cmd, venueId, withVenue, count); },
        })));
        finish(false, SPEECH.which);
      } else {
        setChoices([]);
        finish(false, SPEECH.itemNotFound);
      }
      return;
    }

    setChoices([]);
    await applyTo(intent, entry, cmd, venueId, withVenue, count);
  }, [clearConfirm, finish, resolveEntry, resolveVenue, say]);

  const applyTo = useCallback(async (
    intent: Intent,
    entry: ServiceEntry,
    cmd: ServiceCommands,
    venueId: string,
    withVenue: (t: string) => string,
    count: number,
  ) => {
    const idx = cmd.entries.findIndex(e => e.id === entry.id);
    const hora = new Date(entry.serveAt).toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    });

    switch (intent) {
      case 'MARCAR': {
        setState('executando');
        const r = await cmd.setServed(entry.id, true);
        finish(r.ok, r.ok ? withVenue(`${entry.itemName} ${SPEECH.served}`) : r.error);
        return;
      }
      case 'DESMARCAR': {
        setState('executando');
        const r = await cmd.setServed(entry.id, false);
        finish(r.ok, r.ok ? withVenue(`${entry.itemName} ${SPEECH.unserved}`) : r.error);
        return;
      }
      case 'DUPLICAR': {
        setState('executando');
        const r = await cmd.duplicate(entry.id);
        finish(r.ok, r.ok ? withVenue(`${entry.itemName} ${SPEECH.duplicated}`) : r.error);
        return;
      }
      case 'SUBIR': {
        setState('executando');
        const r = await cmd.moveToPosition(entry.id, Math.max(0, idx - count));
        finish(r.ok, r.ok ? withVenue(`${entry.itemName} subiu`) : r.error);
        return;
      }
      case 'DESCER': {
        setState('executando');
        const r = await cmd.moveToPosition(entry.id, idx + count);
        finish(r.ok, r.ok ? withVenue(`${entry.itemName} desceu`) : r.error);
        return;
      }
      case 'PROXIMO':
      case 'ADIANTAR': {
        setState('executando');
        // Depois da última servida: é onde "o próximo é o X" realmente quer colocar.
        const lastServed = cmd.entries.reduce((acc, e, i) => (e.status === 'served' ? i : acc), -1);
        const r = await cmd.moveToPosition(entry.id, lastServed + 1, intent === 'ADIANTAR');
        finish(r.ok, r.ok ? withVenue(`${entry.itemName} é o próximo`) : r.error);
        return;
      }
      case 'REMOVER': {
        if (!optsRef.current.allowRemove) {
          finish(false, 'remover por voz está desligado');
          return;
        }
        // Resolve o alvo ANTES de confirmar, e fala o horário: é o que deixa a pessoa perceber
        // alvo errado antes de acontecer, e desambigua rodadas duplicadas.
        setPending({ venueId, entryId: entry.id, label: entry.itemName, timeLabel: hora });
        setState('confirmando');
        beep('confirm');
        say(`confirma remover ${entry.itemName} das ${hora}?`);
        confirmTimer.current = setTimeout(() => {
          clearConfirm();
          setState('idle');
          beep('close');
          say(SPEECH.cancelled);
        }, CONFIRM_TIMEOUT_MS);
        return;
      }
      default:
        finish(false, SPEECH.notUnderstood);
    }
  }, [clearConfirm, finish, say]);

  const executeRemoval = useCallback(async () => {
    const p = pendingRef.current;
    clearConfirm();
    if (!p) { setState('idle'); return; }
    const cmd = optsRef.current.getCommands(p.venueId);
    // Revalida: o poll de 60s pode ter trocado o payload desde a pergunta.
    if (!cmd || !cmd.entries.some(e => e.id === p.entryId)) {
      finish(false, 'esse item não está mais na lista');
      return;
    }
    setState('executando');
    const r = await cmd.remove(p.entryId);
    finish(r.ok, r.ok ? SPEECH.removed : r.error);
  }, [clearConfirm, finish]);

  // ── Ciclo de captura ─────────────────────────────────────────────────────

  const handleTranscript = useCallback(async (text: string) => {
    const o = optsRef.current;
    setTranscript(text);

    if (!text) { beep('ignored'); setState('idle'); return; }

    const cmd = parseIntent(text, o.mode);
    if (!cmd) { beep('ignored'); setMessage(SPEECH.notUnderstood); setState('idle'); return; }

    // Em confirmação só valem sim/não — qualquer outra coisa é tentativa perdida, e duas
    // tentativas perdidas CANCELAM. Falha sempre fechada.
    if (pendingRef.current) {
      if (cmd.intent === 'CONFIRMAR') { await executeRemoval(); return; }
      if (cmd.intent === 'NEGAR') { clearConfirm(); setState('idle'); beep('close'); say(SPEECH.cancelled); return; }
      if (!confirmRetried.current) {
        confirmRetried.current = true;
        beep('confirm');
        say('não entendi. sim ou não?');
        setState('confirmando');
        void captureAndHandle(3500);
        return;
      }
      clearConfirm();
      setState('idle');
      beep('error');
      say(SPEECH.cancelledSafety);
      return;
    }

    if (cmd.intent === 'CONFIRMAR' || cmd.intent === 'NEGAR') {
      // Sem nada pendente, "sim"/"não" solto não é comando.
      beep('ignored');
      setState('idle');
      return;
    }

    await runIntent(cmd.intent, cmd.target, text, cmd.count);
  }, [clearConfirm, executeRemoval, runIntent, say]);

  const captureAndHandle = useCallback(async (maxMs = 7000) => {
    // Throttle: um loop de ativação falhando não pode virar rajada de requisições.
    const now = Date.now();
    if (now - lastCall.current < 1200) { beep('ignored'); return; }
    lastCall.current = now;

    // Portão anti-eco: nunca gravar enquanto o próprio sistema fala.
    if (isSpeaking()) { beep('ignored'); return; }

    const stream = await mic.acquire();
    if (!stream) { beep('error'); setState('idle'); return; }

    // Hand-off do microfone: o Web Speech abre uma captura própria que não controlamos.
    wakeRef.current.pause();
    setState('gravando');
    beep('open');
    // Bipe ANTES de abrir o gravador — o hand-off come a primeira sílaba.
    await new Promise(r => setTimeout(r, 300));

    let blob: Blob | null = null;
    try {
      blob = await recorder.record({ maxMs });
    } finally {
      beep('close');
      setTimeout(() => { if (optsRef.current && voiceModeRef.current === 'wake') wakeRef.current.resume(); }, 300);
    }

    if (!blob || blob.size < 2000) { beep('ignored'); setState('idle'); return; }

    setState('transcrevendo');
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'command.webm');
      // Vocabulário da tela: é a maior alavanca de precisão pra nome de prato.
      fd.append('hints', JSON.stringify(collectHints()));

      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 12_000);
      const res = await fetch('/api/v2/kitchen/display/voice/transcribe', {
        method: 'POST', credentials: 'include', body: fd, signal: ctrl.signal,
      });
      clearTimeout(to);

      if (res.status === 429) { beep('error'); say(SPEECH.busy); setState('idle'); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        beep('error'); say(d.error ? '' : SPEECH.offline); setMessage(d.error || SPEECH.offline);
        setState('idle');
        return;
      }
      const d = await res.json();
      await handleTranscript((d.text ?? '').trim());
    } catch {
      beep('error');
      say(SPEECH.offline);
      setState('idle');
    }
  }, [handleTranscript, mic, recorder, say]);

  const voiceModeRef = useRef<VoiceMode>('off');
  voiceModeRef.current = voiceMode;

  /** Nomes visíveis, priorizando o que ainda não saiu — é sobre isso que se fala. */
  function collectHints(): string[] {
    const o = optsRef.current;
    const out: string[] = [];
    for (const v of o.venues) {
      if (o.mode === 'semana') {
        for (const i of o.getWeekItems(v.id)) out.push(i.itemName);
      } else {
        const cmd = o.getCommands(v.id);
        if (!cmd) continue;
        for (const e of cmd.entries) if (e.status !== 'served') out.push(e.itemName);
        for (const e of cmd.entries) if (e.status === 'served') out.push(e.itemName);
        for (const a of cmd.available) out.push(a.itemName);
      }
    }
    return [...new Set(out)];
  }

  // ── Liga/desliga ─────────────────────────────────────────────────────────

  const enable = useCallback(async (target: 'ptt' | 'wake') => {
    // Tudo dentro do gesto: AudioContext, TTS e permissão de microfone exigem isso.
    unlockAudio();
    const stream = await mic.acquire();
    if (!stream) { setVoiceMode('off'); setState('off'); return; }
    void recorder.calibrate(1500);

    if (target === 'wake') {
      if (!isWebSpeechAvailable()) {
        setMessage('Este navegador não tem escuta contínua. Use o botão.');
        setVoiceMode('ptt');
        setState('idle');
        beep('ok');
        return;
      }
      const engine = createWebSpeechWakeEngine({
        onWake: () => {
          if (stateRef.current !== 'idle' && stateRef.current !== 'confirmando') return;
          if (isSpeaking()) return;
          // Ativação durante confirmação CANCELA em vez de ser interpretada: senão conversa
          // com a palavra "sim" dentro apagaria uma linha.
          if (pendingRef.current) { clearConfirm(); setState('idle'); beep('close'); say(SPEECH.cancelled); return; }
          void captureAndHandle();
        },
        onFatal: (msg) => { setMessage(msg); setVoiceMode('ptt'); },
      });
      wakeRef.current = engine;
      try { await engine.start(); } catch (e: any) { setMessage(e?.message ?? 'Falha na escuta contínua.'); setVoiceMode('ptt'); setState('idle'); beep('ok'); return; }
    }

    setVoiceMode(target);
    setState('idle');
    beep('ok');
  }, [captureAndHandle, clearConfirm, mic, recorder, say]);

  const disable = useCallback(() => {
    wakeRef.current.stop();
    wakeRef.current = NoopWakeEngine;
    recorder.cancel();
    stopSpeaking();
    clearConfirm();
    setChoices([]);
    setVoiceMode('off');
    setState('off');
    setTranscript('');
    setMessage('');
  }, [clearConfirm, recorder]);

  useEffect(() => () => { wakeRef.current.stop(); }, []);

  return {
    voiceMode, state, transcript, message, pending, choices,
    available, availableReason,
    micError: mic.error,
    level: recorder.level,
    enable, disable,
    /** Botão de apertar-e-falar. Segundo toque cancela. */
    pushToTalk: () => {
      if (state === 'gravando') { recorder.cancel(); setState('idle'); beep('close'); return; }
      if (state !== 'idle' && state !== 'confirmando') return;
      void captureAndHandle(state === 'confirmando' ? 3500 : 7000);
    },
    confirmRemoval: executeRemoval,
    cancelRemoval: () => { clearConfirm(); setState('idle'); beep('close'); say(SPEECH.cancelled); },
    dismissChoices: () => setChoices([]),
  };
}
