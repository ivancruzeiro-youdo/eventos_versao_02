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

// Bloqueia qualquer palavra-chave de escrita/DDL/administração, como whole-word (evita
// falso positivo em nomes de coluna/tabela que só contenham a palavra como substring).
const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|exec|execute|call|copy|merge|vacuum|reindex|attach|detach|pragma|listen|notify|unlisten|do|comment|lock|refresh)\b/i;

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
    throw new Error('Consulta contém uma palavra-chave não permitida (só leitura é permitida).');
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
