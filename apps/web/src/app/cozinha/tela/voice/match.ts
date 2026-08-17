// Casamento aproximado do nome falado contra os itens que estão na tela.
//
// Os candidatos são só as entradas renderizadas na coluna alvo (tipicamente 8-25) — é isso
// que torna o problema tratável sem LLM. O score combina três sinais porque nenhum sozinho
// resolve: contenção de tokens não perdoa erro de transcrição, Levenshtein sozinho confunde
// nomes parecidos, e nenhum dos dois sabe que "blumenau" identifica e "mini" não.

/** Remove acento via propriedade Unicode (range de combinantes escrito à mão fica invisível
 *  no editor e quebra em reencode do arquivo). */
export function normalize(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Palavras que não distinguem nada num nome de prato.
const STOPWORDS = new Set([
  'de', 'do', 'da', 'dos', 'das', 'com', 'e', 'o', 'a', 'os', 'as', 'ao', 'aos', 'em', 'no', 'na',
  'um', 'uma', 'sem', 'ou', 'pro', 'pra', 'para',
]);

export function tokens(s: string): string[] {
  return normalize(s).split(' ').filter(t => t && !STOPWORDS.has(t));
}

/** Levenshtein com early-exit por limite — só precisamos saber se está "perto". */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

function similar(a: string, b: string): boolean {
  if (a === b) return true;
  // Token curto exige igualdade: "pao"/"pau" não podem casar.
  const max = Math.max(a.length, b.length);
  if (max < 5) return false;
  return 1 - levenshtein(a, b) / max >= 0.8;
}

export interface Candidate<T> {
  value: T;
  /** Texto usado no casamento (nome do item, do pacote, do espaço). */
  text: string;
}

export interface MatchResult<T> {
  best: T | null;
  bestScore: number;
  /** Diferença até o segundo colocado — base da decisão de ambiguidade. */
  gap: number;
  /** Ordenado por score desc, para oferecer as alternativas na tela. */
  ranked: { value: T; text: string; score: number }[];
  ambiguous: boolean;
}

export const ACCEPT_THRESHOLD = 0.62;
export const AMBIGUITY_GAP = 0.12;

/**
 * Pontua cada candidato contra a fala. Score em 0..1.
 *
 * A pontuação é pela ÓTICA DA FALA, não do candidato: quanto do que a pessoa disse foi
 * encontrado neste candidato. Isso importa porque em voz ninguém fala o nome completo — fala
 * a parte que distingue. Pontuar por cobertura do candidato faria "blumenau" tirar nota baixa
 * em "Arancini de linguiça blumenau" (1 de 3 tokens), exatamente ao contrário do desejado.
 *
 * O peso IDF sobre os próprios candidatos faz o resto: "blumenau" existe num só candidato e
 * pesa dobrado, então resolve sozinho; "arancini" existe em dois e empata, virando ambiguidade
 * — que é o comportamento correto, porque aí realmente não se sabe qual.
 *
 * Deliberadamente SEM desempate por cobertura: entre "Arancini de queijo" e "Arancini de
 * linguiça blumenau", quem falou só "arancini" tem que ser perguntado, não servido com o de
 * nome mais curto.
 */
export function matchBest<T>(spoken: string, candidates: Candidate<T>[]): MatchResult<T> {
  const spokenTokens = tokens(spoken);
  const empty: MatchResult<T> = { best: null, bestScore: 0, gap: 0, ranked: [], ambiguous: false };
  if (spokenTokens.length === 0 || candidates.length === 0) return empty;

  // IDF sobre o conjunto de candidatos: token presente em um só candidato pesa dobrado.
  const docFreq = new Map<string, number>();
  const candTokens = candidates.map(c => {
    const ts = tokens(c.text);
    for (const t of new Set(ts)) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
    return ts;
  });
  // Token que a pessoa falou e não existe em candidato nenhum não deve puxar o score de todos
  // pra baixo igualmente — mas também não pode ser ignorado, senão "arancini banana" casaria
  // igual a "arancini". Peso 1 resolve: penaliza sem zerar.
  const weightOf = (t: string) => {
    const df = docFreq.get(t) ?? 0;
    if (df === 0) return 1;
    return df <= 1 ? 2 : 1;
  };

  const ranked = candidates.map((c, i) => {
    const ts = new Set(candTokens[i]);
    if (ts.size === 0) return { value: c.value, text: c.text, score: 0 };

    let matched = 0;
    let total = 0;
    for (const st of spokenTokens) {
      const w = weightOf(st);
      total += w;
      if (ts.has(st)) {
        matched += w;
      } else if ([...ts].some(t => similar(st, t))) {
        // Erro de transcrição ("arancine" → "arancini") conta, mas com desconto.
        matched += w * 0.85;
      }
    }
    return { value: c.value, text: c.text, score: total > 0 ? matched / total : 0 };
  }).sort((a, b) => b.score - a.score);

  const bestScore = ranked[0]?.score ?? 0;
  const secondScore = ranked[1]?.score ?? 0;
  const gap = bestScore - secondScore;

  return {
    best: bestScore >= ACCEPT_THRESHOLD ? ranked[0].value : null,
    bestScore,
    gap,
    ranked,
    // Ambíguo só quando os dois passam do limiar e estão colados — aí não se adivinha.
    ambiguous: bestScore >= ACCEPT_THRESHOLD && secondScore >= ACCEPT_THRESHOLD && gap < AMBIGUITY_GAP,
  };
}

/** Ordinais falados → índice (0-based). "o primeiro", "o terceiro", "o de cima". */
const ORDINALS: Record<string, number> = {
  primeiro: 0, primeira: 0, 'de cima': 0, 'do topo': 0,
  segundo: 1, segunda: 1,
  terceiro: 2, terceira: 2,
  quarto: 3, quarta: 3,
  quinto: 4, quinta: 4,
  sexto: 5, sexta: 5,
};

/**
 * Tratamento por posição, que é à prova de ruído e sem risco de casamento errado — a forma
 * que vale ensinar como principal ("marca o primeiro"). Nome de item é a conveniência.
 */
export function parseOrdinal(spoken: string): number | null {
  const n = normalize(spoken);
  for (const [word, idx] of Object.entries(ORDINALS)) {
    if (new RegExp(`\\b${word}\\b`).test(n)) return idx;
  }
  if (/\bultim[oa]\b/.test(n) || /\bdo fim\b/.test(n) || /\bde baixo\b/.test(n)) return -1; // último
  return null;
}

/** "o próximo", "agora", "o de agora" → a primeira saída ainda não servida. */
export function mentionsNext(spoken: string): boolean {
  return /\b(proximo|proxima|agora|seguinte)\b/.test(normalize(spoken));
}

/** "item 1", "numero 3", "item numero 2" → número 1-based dito em dígito, direto do texto —
 *  não é ordinal por extenso ("o primeiro"), é o MESMO número que a tela mostra ao lado do
 *  horário de cada linha. Existe pra não precisar falar o nome do prato: "check item 1" em
 *  vez de "check bruschetta de tomate seco". */
export function parseItemNumber(spoken: string): number | null {
  return parseItemNumbers(spoken)[0] ?? null;
}

/** "item 1 e 2", "itens 1, 2 e 3" → [1, 2] / [1, 2, 3] — mesma ideia de `parseItemNumber`,
 *  mas aceita mais de um número na mesma frase, pra "marcar item 1 e 2" marcar os dois de
 *  uma vez em vez de exigir dois comandos separados. A vírgula nunca aparece aqui porque
 *  `normalize()` já a converteu em espaço antes deste ponto. */
export function parseItemNumbers(spoken: string): number[] {
  const n = normalize(spoken);
  const m = n.match(/\b(?:itens?|numeros?)\s+((?:\d{1,2}\s*(?:e\s+)?)+)/);
  if (!m) return [];
  const nums = (m[1].match(/\d{1,2}/g) ?? []).map(s => parseInt(s, 10)).filter(v => v >= 1);
  return [...new Set(nums)];
}
