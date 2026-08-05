// Execução segura de SQL gerado pela IA (routes/ai-chat.ts) — dupla camada de defesa:
// 1) validação aqui em código (só SELECT/WITH, uma única instrução, sem palavras-chave
//    de escrita); 2) a conexão em si usa a role "ai_readonly" do Postgres (criada na
//    migration 20260804140000_ai_chat_assistant), que fisicamente só tem permissão de
//    SELECT — mesmo que a validação abaixo tenha uma falha, o banco recusa qualquer
//    escrita no nível da própria conta.
import { PrismaClient } from '@youdo/db';

let client: PrismaClient | null = null;

function getReadOnlyClient(): PrismaClient {
  if (client) return client;
  const url = process.env.AI_READONLY_DATABASE_URL;
  if (!url) throw new Error('AI_READONLY_DATABASE_URL não configurado no ambiente.');
  client = new PrismaClient({ datasources: { db: { url } } });
  return client;
}

// A consulta já é obrigada a começar com SELECT/WITH e a não conter ";", então a única
// escrita que ainda cabe aqui é uma CTE que modifica dados — o Postgres aceita
// `WITH x AS (INSERT ...) SELECT ...`. É só isso que precisa ser bloqueado.
//
// Uma lista mais ampla parece mais segura e não é: `comment` é nome de coluna real
// ("EventNPS"."comment", "EventMediaAsset"."comment") e `do` aparece em nome próprio em
// português ("Lucas berg do Prado"), então bloquear essas palavras rejeitava consultas
// perfeitamente legítimas. Palavras como DROP/ALTER/GRANT não precisam estar aqui: não são
// aninháveis dentro de um SELECT, e a role ai_readonly não teria permissão de executá-las
// de todo jeito (é essa a camada que realmente protege).
const FORBIDDEN_KEYWORDS = /\b(insert|update|delete|merge)\s/i;

// Funções que a role só-leitura ainda conseguiria chamar e que causam dano sem escrever
// nada (travar a conexão, ler arquivo, abrir socket).
const FORBIDDEN_FUNCTIONS =
  /\b(pg_sleep|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|lo_import|lo_export|dblink|pg_terminate_backend|pg_cancel_backend|set_config|pg_reload_conf)\b/i;

export async function runReadOnlyQuery(sql: string): Promise<any[]> {
  const trimmed = sql.trim().replace(/;+\s*$/, '');

  if (!trimmed) throw new Error('Consulta vazia.');
  if (!/^(select|with)\b/i.test(trimmed)) {
    throw new Error('Só consultas SELECT (ou WITH ... SELECT) são permitidas.');
  }
  if (trimmed.includes(';')) {
    throw new Error('Apenas uma instrução por consulta — remova o ";" no meio do texto.');
  }
  if (FORBIDDEN_KEYWORDS.test(trimmed)) {
    throw new Error('Consulta tenta modificar dados (INSERT/UPDATE/DELETE/MERGE) — só leitura é permitida.');
  }
  if (FORBIDDEN_FUNCTIONS.test(trimmed)) {
    throw new Error('Consulta usa uma função de sistema não permitida.');
  }

  // Nunca deixa a IA devolver um resultado gigante pro modelo (custo de tokens) nem
  // pro usuário — limite razoável pra perguntas de gestão/relatório.
  const wrapped = `SELECT * FROM (${trimmed}) AS _ai_query LIMIT 500`;

  const db = getReadOnlyClient();
  const rows = await db.$queryRawUnsafe<any[]>(wrapped);
  return rows.map(normalizeRow);
}

// $queryRawUnsafe devolve os tipos crus do driver, e vários deles quebram o
// JSON.stringify que usamos pra mandar o resultado pro modelo: count(*) vem como BigInt
// ("Do not know how to serialize a BigInt"), colunas numeric vêm como Prisma.Decimal,
// bytea como Buffer. Normaliza tudo pra JSON puro aqui, num só lugar.
function normalizeRow(row: any): any {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row ?? {})) {
    out[key] = normalizeValue(value);
  }
  return out;
}

function normalizeValue(value: any): any {
  if (value === null || value === undefined) return null;

  if (typeof value === 'bigint') {
    // Number é seguro pra contagens/somas reais do sistema; acima de 2^53 preferimos
    // string a perder precisão silenciosamente.
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }

  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `<${value.length} bytes>`;
  if (Array.isArray(value)) return value.map(normalizeValue);

  // Prisma.Decimal (e qualquer objeto com toFixed/toString numérico) → number
  if (typeof value === 'object') {
    if (typeof (value as any).toFixed === 'function') {
      const n = Number((value as any).toString());
      return Number.isFinite(n) ? n : (value as any).toString();
    }
    // JSON/JSONB e afins: normaliza recursivamente
    return normalizeRow(value);
  }

  return value;
}
