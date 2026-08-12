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
  | 'PRODUZIDO' | 'REMOVER'
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

    // O alvo é o que sobra sem o verbo, e sem as palavras de ligação que grudam nele.
    // Remove TODAS as ocorrências, não só a primeira: "errado, volta" casa por "errado" e
    // deixaria "volta" como alvo, que iria pro matcher, falharia, e a tela diria "não achei
    // esse item" em vez de simplesmente desmarcar.
    const stripAll = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    const target = n
      .replace(stripAll, ' ')
      .replace(/\b(o|a|os|as|do|da|de|dos|das|esse|essa|aquele|aquela|ai|la|agora|por favor)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      intent: rule.intent,
      target,
      global: !!rule.global,
      count: extractCount(n),
      raw: text,
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
