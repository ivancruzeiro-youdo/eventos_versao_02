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
  return db.$queryRawUnsafe(wrapped);
}
