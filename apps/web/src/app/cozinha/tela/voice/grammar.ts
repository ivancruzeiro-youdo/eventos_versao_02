// Gramática dos comandos falados. Lista ORDENADA — o primeiro padrão que casar vence, e a
// ordem é carga funcional: "nao saiu" tem que ser testado antes de "saiu", senão desmarcar
// nunca acontece.
//
// Os verbos são os que uma cozinha realmente diz, não os que estão nos botões: ninguém fala
// "alternar status", fala "saiu" ou "mandei".
import { normalize } from './match';

export type Intent =
  | 'MARCAR' | 'DESMARCAR' | 'DUPLICAR'
  | 'SUBIR' | 'DESCER' | 'PROXIMO' | 'ADIANTAR'
  | 'PRODUZIDO' | 'REMOVER' | 'MUDAR_HORARIO'
  | 'CONFIRMAR' | 'NEGAR'
  | 'ATUALIZAR' | 'PARAR' | 'DESLIGAR_MIC' | 'GERAR';

export type Mode = 'semana' | 'dia';

interface Rule {
  intent: Intent;
  re: RegExp;
  /** Em que modo o padrão vale. Ausente = os dois. */
  mode?: Mode;
  /** Comando global: não precisa de alvo. */
  global?: boolean;
}

// "pronto" colide entre modos — no dia significa servido, na semana significa produzido — por
// isso cada um tem seu próprio padrão restrito por modo.
const RULES: Rule[] = [
  // Negações primeiro: "nao saiu" / "ainda nao" não podem cair em MARCAR.
  { intent: 'DESMARCAR', re: /\b(desmarca\w*|nao saiu|ainda nao|nao foi|volta\w*|desfaz\w*|errado|errei)\b/ },

  { intent: 'NEGAR',     re: /^(nao|nao nao|cancela\w*|deixa|deixa pra la|negativo|esquece)\b/, global: true },
  { intent: 'CONFIRMAR', re: /^(sim|isso|isso ai|confirma\w*|pode|pode ser|positivo|ok|beleza|certo)\b/, global: true },

  { intent: 'DESLIGAR_MIC', re: /\b(desliga\w* o (microfone|mic)|para de escutar|desliga a voz)\b/, global: true },
  { intent: 'PARAR',        re: /^(para|parar|silencio|cancela tudo|esquece tudo)\b/, global: true },
  { intent: 'ATUALIZAR',    re: /\b(atualiza\w*|recarrega\w*|refresh)\b/, global: true },
  { intent: 'GERAR',        re: /\b(gera\w* (a )?sequencia|monta\w* (a )?sequencia|gera\w* tudo)\b/, global: true },

  { intent: 'REMOVER',   re: /\b(remove\w*|remover|tira\w*|exclui\w*|apaga\w*|deleta\w*)\b/ },

  { intent: 'DUPLICAR',  re: /\b(de novo|mais uma vez|repete\w*|repetir|duplica\w*|outra rodada|segunda rodada|mais uma saida)\b/ },

  // Verbos exclusivos daqui pra não colidir com ADIANTAR/DESCER (que reordenam a sequência,
  // não mudam o horário de saída) — "muda o horário", "remarca", "reagenda", "ajusta a hora".
  { intent: 'MUDAR_HORARIO', re: /\b(muda\w* (o |a )?(horario|hora)|troca\w* (o |a )?(horario|hora)|remarca\w*|reagenda\w*|ajusta\w* (o |a )?(horario|hora)|corrige\w* (o |a )?horario)\b/, mode: 'dia' },

  { intent: 'ADIANTAR',  re: /\b(adianta\w*|antecipa\w*)\b/ },
  { intent: 'PROXIMO',   re: /\b(proximo e|proxima e|agora e|agora vai|vai o|manda o|manda a|chama o)\b/ },
  { intent: 'SUBIR',     re: /\b(sobe\w*|subir|passa na frente|pra frente|primeiro lugar)\b/ },
  { intent: 'DESCER',    re: /\b(desce\w*|descer|joga pro fim|pro final|mais pra frente no tempo)\b/ },

  { intent: 'PRODUZIDO', re: /\b(produzido|produzida|ja fiz|ja fizemos|feito|ja esta feito|pronto|prontinho)\b/, mode: 'semana' },
  { intent: 'MARCAR',    re: /\b(saiu|ja saiu|ja foi|mandei|mandou|mandamos|subiu|serviu|servido|servida|entregue|entreguei|marca\w*|pronto)\b/, mode: 'dia' },
  // Fora do modo dia, "marca ..." ainda deve funcionar como marcar produzido.
  { intent: 'PRODUZIDO', re: /\b(marca\w*|saiu|ja foi)\b/, mode: 'semana' },
];

export interface ParsedCommand {
  intent: Intent;
  /** Texto restante depois de tirar o verbo — é o que vai pro matcher de item. */
  target: string;
  global: boolean;
  /** "sobe dois" → 2. Ausente = 1. */
  count: number;
  raw: string;
  /** Só para MUDAR_HORARIO — null quando o verbo foi dito mas nenhum horário foi entendido. */
  time?: { hh: number; mm: number } | null;
}

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
};

function extractCount(n: string): number {
  const digits = n.match(/\b(\d+)\b/);
  if (digits) {
    const v = parseInt(digits[1], 10);
    if (v >= 1 && v <= 20) return v;
  }
  for (const [w, v] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${w}\\b`).test(n)) return v;
  }
  return 1;
}

/** "as dezenove e trinta" a essa altura já veio transcrito como dígitos pelo Whisper — só
 *  precisa reconhecer o formato, não a fala solta. Cobre "19:30", "19h30", "19 30", "19h",
 *  "19 horas" (:00) e "19 e meia" (:30). Devolve também o trecho casado, pra tirar do alvo
 *  antes de mandar pro matcher de item — senão "19" no meio do nome do prato confunde o score. */
function extractTime(n: string): { hh: number; mm: number; matched: string } | null {
  let m = n.match(/\b([01]?\d|2[0-3])[:h ]([0-5]\d)\b/);
  if (m) return { hh: parseInt(m[1], 10), mm: parseInt(m[2], 10), matched: m[0] };

  m = n.match(/\b([01]?\d|2[0-3])\s*(horas?)?\s*e\s*meia\b/);
  if (m) return { hh: parseInt(m[1], 10), mm: 30, matched: m[0] };

  m = n.match(/\b([01]?\d|2[0-3])\s*h(oras?)?\b/);
  if (m) return { hh: parseInt(m[1], 10), mm: 0, matched: m[0] };

  return null;
}

/**
 * Extrai intenção e alvo. Devolve null quando nada casa — e nesse caso o controlador NÃO age,
 * só emite um bipe grave: agir por palpite em cima de ruído é o caminho mais curto para o
 * operador desligar a voz no primeiro turno.
 */
export function parseIntent(text: string, mode: Mode): ParsedCommand | null {
  const n = normalize(text);
  if (!n) return null;

  for (const rule of RULES) {
    if (rule.mode && rule.mode !== mode) continue;
    const m = n.match(rule.re);
    if (!m) continue;

    // MUDAR_HORARIO: tira o trecho do horário ANTES de montar o alvo — senão "19" ou "30"
    // sobrando no meio do nome do prato bagunça o score do matcher de item.
    let working = n;
    let time: { hh: number; mm: number } | null = null;
    if (rule.intent === 'MUDAR_HORARIO') {
      const t = extractTime(working);
      if (t) { time = { hh: t.hh, mm: t.mm }; working = working.replace(t.matched, ' '); }
    }

    // O alvo é o que sobra sem o verbo, e sem as palavras de ligação que grudam nele.
    // Remove TODAS as ocorrências, não só a primeira: "errado, volta" casa por "errado" e
    // deixaria "volta" como alvo, que iria pro matcher, falharia, e a tela diria "não achei
    // esse item" em vez de simplesmente desmarcar.
    const stripAll = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    let target = working
      .replace(stripAll, ' ')
      .replace(/\b(o|a|os|as|do|da|de|dos|das|esse|essa|aquele|aquela|ai|la|agora|por favor)\b/g, ' ');
    // "pra"/"para" só faz sentido tirar do alvo quando o comando é de horário ("muda o X pra
    // 19:30") — em outros intents pode legitimamente fazer parte do que sobrou.
    if (rule.intent === 'MUDAR_HORARIO') target = target.replace(/\b(pra|para)\b/g, ' ');
    target = target.replace(/\s+/g, ' ').trim();

    return {
      intent: rule.intent,
      target,
      global: !!rule.global,
      count: extractCount(n),
      raw: text,
      time: rule.intent === 'MUDAR_HORARIO' ? time : undefined,
    };
  }

  return null;
}

/** Frases curtas faladas pelo sistema — mantidas de duas palavras de propósito. */
export const SPEECH = {
  micOpen: 'pode falar',
  notUnderstood: 'não entendi',
  itemNotFound: 'não achei esse item',
  which: 'qual deles',
  served: 'servido',
  unserved: 'desmarcado',
  duplicated: 'duplicado',
  moved: 'movido',
  produced: 'produzido',
  removed: 'removido',
  cancelled: 'cancelado',
  cancelledSafety: 'cancelei por segurança',
  noPermission: 'sem permissão',
  offline: 'sem conexão',
  busy: 'serviço de voz ocupado',
  whichVenue: 'em qual espaço',
} as const;
