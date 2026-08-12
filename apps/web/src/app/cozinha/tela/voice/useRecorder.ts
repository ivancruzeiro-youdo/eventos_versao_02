'use client';

// Gravação de um comando: começa, detecta quando a pessoa parou de falar, e para.
//
// Não é janela fixa nem segurar-o-botão. Janela fixa corta comando longo e espera à toa no
// curto; segurar é errado pra mão suja. Detecção de silêncio com teto rígido resolve os dois.
import { useCallback, useRef, useState } from 'react';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''];

function pickMime(): string {
  for (const t of MIME_CANDIDATES) {
    if (!t) return '';
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch { /* segue */ }
  }
  return '';
}

interface RecordOpts {
  /** Teto rígido. Em cozinha muito barulhenta o detector de silêncio pode nunca disparar. */
  maxMs?: number;
  /** Silêncio contínuo que encerra, depois de ter havido fala. */
  silenceMs?: number;
  /** Nunca encerra antes disso — senão corta um "sim". */
  minMs?: number;
}

export function useRecorder(streamRef: React.MutableRefObject<MediaStream | null>) {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const cancelRef = useRef(false);
  const stopRef = useRef<(() => void) | null>(null);

  // Piso de ruído do ambiente, calibrado ao ligar e recalibrado periodicamente: ruído de
  // cozinha em pré-preparo e em serviço são outro mundo, um limiar fixo não serve pros dois.
  const floorRef = useRef(0.012);

  const calibrate = useCallback(async (ms = 1500) => {
    const stream = streamRef.current;
    if (!stream) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ac = new AC();
    try {
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      const samples: number[] = [];
      const t0 = Date.now();
      await new Promise<void>(resolve => {
        const tick = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
          samples.push(Math.sqrt(sum / buf.length));
          if (Date.now() - t0 >= ms) resolve(); else setTimeout(tick, 50);
        };
        tick();
      });
      samples.sort((a, b) => a - b);
      // Mediana em vez de média: um prato caindo durante a calibração não estraga o piso.
      floorRef.current = samples[Math.floor(samples.length / 2)] || 0.012;
    } catch { /* mantém o piso anterior */ } finally {
      void ac.close();
    }
  }, [streamRef]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    stopRef.current?.();
  }, []);

  /** Grava até a pessoa parar de falar. Resolve null se cancelado ou sem áudio. */
  const record = useCallback(async (opts: RecordOpts = {}): Promise<Blob | null> => {
    const { maxMs = 7000, silenceMs = 900, minMs = 1200 } = opts;
    const stream = streamRef.current;
    if (!stream || recording) return null;

    cancelRef.current = false;
    setRecording(true);

    const mime = pickMime();
    const chunks: BlobPart[] = [];
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      setRecording(false);
      return null;
    }

    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ac = new AC();
    const src = ac.createMediaStreamSource(stream);
    const an = ac.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);

    const threshold = Math.max(floorRef.current * 2.2, floorRef.current + 0.012);
    let spokeMs = 0;
    let quietMs = 0;
    const t0 = Date.now();
    let timer: any = null;

    const done = new Promise<Blob | null>(resolve => {
      rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
      rec.onstop = () => {
        if (timer) clearInterval(timer);
        void ac.close();
        setRecording(false);
        setLevel(0);
        if (cancelRef.current) { resolve(null); return; }
        // Sem timeslice: o Whisper precisa do container inteiro, não de pedaços.
        resolve(chunks.length ? new Blob(chunks, { type: mime || 'audio/webm' }) : null);
      };
    });

    stopRef.current = () => { try { if (rec.state !== 'inactive') rec.stop(); } catch { /* noop */ } };

    // Sem timeslice de propósito (ver onstop).
    rec.start();

    timer = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.min(1, rms / (threshold * 2)));

      const elapsed = Date.now() - t0;
      if (rms > threshold) { spokeMs += 50; quietMs = 0; } else { quietMs += 50; }

      const spokeEnough = spokeMs >= 400;
      const longEnough = elapsed >= minMs;
      if ((spokeEnough && longEnough && quietMs >= silenceMs) || elapsed >= maxMs) {
        stopRef.current?.();
      }
    }, 50);

    return done;
  }, [recording, streamRef]);

  return { record, cancel, recording, level, calibrate };
}
