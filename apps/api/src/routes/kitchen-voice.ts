// TELA COZINHA — transcrição de comandos de voz.
//
// Só transcreve: a interpretação do comando é determinística e roda no cliente
// (voice/grammar.ts + voice/match.ts). Isso é deliberado — o ciclo já leva ~4s com gravação
// + Whisper, e um LLM interpretando levaria a ~6s pra marcar um canapé. Além disso, um
// matcher com limiar explícito consegue dizer "não entendi qual", enquanto um LLM inventa um
// id com confiança — inaceitável no caminho de remover.
//
// O áudio NUNCA é gravado em disco, no S3 ou em log. Só métricas de tamanho.
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { toFile } from 'openai';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getConfig, getOpenAI } from '../lib/openai.js';

const WRITE_ROLES = ['admin', 'event_owner', 'operator'];

// Áudio de comando é curto (teto de 7s no cliente); 2 MB é folga larga pra Opus.
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
// Abaixo disso não há fala nenhuma — devolve vazio sem gastar chamada de API.
const MIN_AUDIO_BYTES = 2000;

/** Alucinações clássicas do Whisper em pt-BR quando recebe silêncio ou puro ruído. */
const HALLUCINATIONS = [
  'obrigado por assistir',
  'obrigada por assistir',
  'legendas pela comunidade',
  'legendas por',
  'amara.org',
  'subtitles by',
  'inscreva-se no canal',
  'tchau',
  'ate a proxima',
];

function normalize(s: string): string {
  // \p{Diacritic} em vez do range de combinantes escrito à mão: o range literal fica
  // invisível no editor e quebra silenciosamente em qualquer reencode do arquivo.
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();
}

/**
 * Monta o `prompt` do Whisper com o vocabulário que está na tela. É a maior alavanca de
 * precisão para nomes como "Arancini de linguiça blumenau" — sem isso, Whisper transcreve
 * foneticamente algo que o matcher não reconhece.
 */
function buildPrompt(hints: string[]): string {
  const base = 'Comandos de cozinha em português do Brasil.';
  const cmds = 'Comandos: marcar servido, desmarcar, servir de novo, duplicar, subir, descer, remover, confirma, sim, não.';

  const seen = new Set<string>();
  const items: string[] = [];
  for (const h of hints) {
    const clean = (h ?? '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(clean);
  }

  // O prompt do Whisper tem limite prático (~224 tokens); truncar mantendo a ordem em que o
  // cliente mandou (ele prioriza itens ainda NÃO servidos — é sobre esses que se fala).
  let itemText = '';
  for (const it of items) {
    const next = itemText ? `${itemText}, ${it}` : it;
    if (next.length > 600) break;
    itemText = next;
  }

  return itemText ? `${base} Itens: ${itemText}. ${cmds}` : `${base} ${cmds}`;
}

/** Descarta transcrição que claramente não é comando: curta, alucinação, ou eco do prompt. */
function isJunk(text: string, prompt: string): boolean {
  const t = normalize(text);
  if (t.length < 3) return true;
  if (HALLUCINATIONS.some(h => t.includes(normalize(h)))) return true;
  // Whisper com prompt tende a ecoar o próprio prompt quando recebe silêncio.
  const p = normalize(prompt);
  if (t.length > 12 && p.includes(t)) return true;
  return false;
}

export async function kitchenVoiceRoutes(app: FastifyInstance) {
  // Multipart é registrado POR PLUGIN de rota neste projeto (ver files.ts, activities.ts),
  // não globalmente no server.ts.
  await app.register(multipart, { limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } });

  // Permite a tela desabilitar o botão de voz de cara, com o motivo, em vez de o operador
  // descobrir que não funciona só depois de falar.
  app.get('/kitchen/display/voice/status', { preHandler: requireAuth }, async () => {
    const key = await getConfig('openai_api_key');
    return {
      success: true,
      enabled: !!key,
      reason: key ? null : 'Chave da OpenAI não configurada (Cozinha → Configurações).',
    };
  });

  app.post('/kitchen/display/voice/transcribe', {
    preHandler: [requireAuth, requireRole(WRITE_ROLES)],
    // Rate limit próprio: o limite global é 100 req/min pra API INTEIRA, e as colunas da tela
    // já consomem disso com os polls de 20s/60s. Um loop de voz falhando não pode derrubar o
    // poll de que a cozinha depende.
    config: { rateLimit: { max: 40, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const started = Date.now();

    const openai = await getOpenAI();
    if (!openai) {
      return reply.status(400).send({
        error: 'OpenAI não configurado. Acesse Cozinha → Configurações para inserir a chave de API.',
      });
    }

    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'Nenhum áudio enviado.' });

    const buffer = await data.toBuffer();
    if (buffer.length < MIN_AUDIO_BYTES) {
      // Gravação vazia (ninguém falou) — não é erro, só não há comando.
      return { success: true, text: '', empty: true, durationMs: Date.now() - started };
    }

    // hints vêm como campo de texto no mesmo multipart (JSON com os nomes visíveis na tela).
    let hints: string[] = [];
    try {
      const raw = (data.fields as any)?.hints;
      const value = Array.isArray(raw) ? raw[0]?.value : raw?.value;
      if (typeof value === 'string') {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) hints = parsed.filter(x => typeof x === 'string');
      }
    } catch {
      // hints é otimização de precisão, não requisito — segue sem.
    }

    const prompt = buildPrompt(hints);
    // O SDK infere o formato pelo NOME do arquivo: buffer sem nome dá 400 "Invalid file format".
    const ext = data.mimetype?.includes('mp4') ? 'mp4' : 'webm';
    const model = (await getConfig('openai_transcribe_model')) || 'whisper-1';

    let text = '';
    try {
      const file = await toFile(buffer, `command.${ext}`, { type: data.mimetype || 'audio/webm' });
      const result = await openai.audio.transcriptions.create({
        file,
        model,
        // Obrigatório: frase curta e ruidosa em pt-BR é autodetectada como espanhol e vem
        // TRADUZIDA. É o parâmetro de maior impacto isolado.
        language: 'pt',
        prompt,
        temperature: 0,
        response_format: 'json',
      });
      text = (result as any)?.text?.trim() ?? '';
    } catch (err: any) {
      request.log.error({ err: err?.message, bytes: buffer.length }, 'kitchen-voice: falha na transcrição');
      return reply.status(502).send({ error: 'Não foi possível transcrever o áudio.' });
    }

    const junk = isJunk(text, prompt);

    // Log só de métricas — nunca o áudio, nunca o texto completo.
    request.log.info(
      { bytes: buffer.length, textLength: text.length, junk, durationMs: Date.now() - started },
      'kitchen-voice: transcrição'
    );

    return {
      success: true,
      text: junk ? '' : text,
      empty: junk,
      durationMs: Date.now() - started,
    };
  });
}
