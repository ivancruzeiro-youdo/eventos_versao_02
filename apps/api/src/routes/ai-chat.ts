import type { FastifyInstance } from 'fastify';
import { prisma } from '../server.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getConfig, getOpenAI } from '../lib/openai.js';
import { runReadOnlyQuery } from '../lib/ai-readonly-db.js';
import { SCHEMA_PRIMER } from '../lib/ai-chat-schema.js';

const MAX_TOOL_ITERATIONS = 6;

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'run_sql_query',
      description:
        'Roda uma única consulta SQL (SELECT ou WITH...SELECT) só-leitura no banco de dados de produção e retorna as linhas resultantes (limitado a 500). Use pra responder qualquer pergunta sobre dados reais do sistema (eventos, convidados, freelancers, etc.).',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'A consulta SQL (SELECT/WITH), uma única instrução, sem ; no meio.' },
        },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'remember_fact',
      description:
        'Salva um fato ou regra de negócio aprendido nesta conversa (ex.: "evento fechado = Event sem EventClosure associado") pra ser reaproveitado automaticamente em conversas futuras. Use quando descobrir algo não-óbvio sobre o esquema/dados que valeria saber de antemão da próxima vez.',
      parameters: {
        type: 'object',
        properties: {
          fact: { type: 'string', description: 'O fato/regra, descrito de forma curta e reutilizável.' },
        },
        required: ['fact'],
      },
    },
  },
];

async function buildSystemPrompt() {
  const knowledge = await prisma.aiKnowledge.findMany({ orderBy: { createdAt: 'asc' } });
  const knowledgeText = knowledge.length
    ? knowledge.map((k) => `- ${k.fact}`).join('\n')
    : '(nenhum fato aprendido ainda)';

  return `Você é um assistente de dados pra equipe de gestão de uma empresa de eventos (YouDO). Responda perguntas em português sobre os dados reais do sistema, usando a ferramenta run_sql_query pra consultar o banco (Postgres) sempre que precisar de números/fatos concretos — nunca invente dados.

${SCHEMA_PRIMER}

## Fatos aprendidos em conversas anteriores
${knowledgeText}

## Instruções
- Sempre que uma pergunta depender de dados (contagens, listas, status), rode uma consulta com run_sql_query em vez de supor.
- Se descobrir uma regra de negócio nova e útil (ex.: como determinar se algo está "fechado"), salve com remember_fact.
- Responda de forma direta e objetiva, com os números encontrados. Se a consulta falhar, ajuste e tente de novo (até um limite razoável de tentativas).`;
}

export async function aiChatRoutes(app: FastifyInstance) {
  const guard = [requireAuth, requireRole(['admin'])];

  // ── Threads ──────────────────────────────────────────────────────────────

  app.get('/ai-chat/threads', { preHandler: guard }, async (request) => {
    const user = (request as any).user;
    const threads = await prisma.aiChatThread.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
    });
    return { threads };
  });

  app.post('/ai-chat/threads', { preHandler: guard }, async (request) => {
    const user = (request as any).user;
    const thread = await prisma.aiChatThread.create({ data: { userId: user.id } });
    return { thread };
  });

  app.get('/ai-chat/threads/:id/messages', { preHandler: guard }, async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params as { id: string };
    const thread = await prisma.aiChatThread.findUnique({ where: { id } });
    if (!thread || thread.userId !== user.id) return reply.status(404).send({ error: 'Conversa não encontrada' });

    const messages = await prisma.aiChatMessage.findMany({
      where: { threadId: id },
      orderBy: { createdAt: 'asc' },
    });
    return { messages };
  });

  app.delete('/ai-chat/threads/:id', { preHandler: guard }, async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params as { id: string };
    const thread = await prisma.aiChatThread.findUnique({ where: { id } });
    if (!thread || thread.userId !== user.id) return reply.status(404).send({ error: 'Conversa não encontrada' });

    await prisma.aiChatThread.delete({ where: { id } });
    return { success: true };
  });

  // ── Send message (runs the tool-calling loop) ───────────────────────────

  app.post('/ai-chat/threads/:id/messages', { preHandler: guard }, async (request, reply) => {
    const user = (request as any).user;
    const { id: threadId } = request.params as { id: string };
    const { content } = request.body as { content: string };

    if (!content?.trim()) return reply.status(400).send({ error: 'Mensagem vazia.' });

    const thread = await prisma.aiChatThread.findUnique({ where: { id: threadId } });
    if (!thread || thread.userId !== user.id) return reply.status(404).send({ error: 'Conversa não encontrada' });

    const openai = await getOpenAI();
    if (!openai) {
      return reply.status(400).send({ error: 'OpenAI não configurado. Acesse Cozinha → Configurações para inserir a chave de API.' });
    }
    const model = (await getConfig('openai_model')) || 'gpt-4o';

    await prisma.aiChatMessage.create({ data: { threadId, role: 'user', content } });

    if (!thread.title) {
      await prisma.aiChatThread.update({
        where: { id: threadId },
        data: { title: content.slice(0, 80) },
      });
    }

    const priorMessages = await prisma.aiChatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
    });

    const conversation: any[] = [
      { role: 'system', content: await buildSystemPrompt() },
      ...priorMessages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const toolTrace: Array<{ tool: string; input: string; rowCount?: number; error?: string }> = [];

    let finalText = '';
    try {
      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        const completion = await openai.chat.completions.create({
          model,
          messages: conversation,
          tools: TOOLS,
          temperature: 0.2,
        });

        const choice = completion.choices[0];
        const message = choice.message;

        if (!message.tool_calls?.length) {
          finalText = message.content || '';
          break;
        }

        conversation.push(message);

        for (const call of message.tool_calls) {
          // O SDK da OpenAI tipa tool_calls como união (function | custom) — só declaramos
          // ferramentas do tipo "function", então ignoramos o resto.
          if (call.type !== 'function') continue;

          const fn = call.function;
          let result: any;
          try {
            const args = JSON.parse(fn.arguments || '{}');
            if (fn.name === 'run_sql_query') {
              const rows = await runReadOnlyQuery(args.sql);
              toolTrace.push({ tool: 'run_sql_query', input: args.sql, rowCount: rows.length });
              result = { rows };
            } else if (fn.name === 'remember_fact') {
              await prisma.aiKnowledge.create({ data: { fact: args.fact } });
              toolTrace.push({ tool: 'remember_fact', input: args.fact });
              result = { success: true };
            } else {
              result = { error: `Ferramenta desconhecida: ${fn.name}` };
            }
          } catch (err: any) {
            toolTrace.push({ tool: fn.name, input: fn.arguments || '', error: err.message });
            result = { error: err.message };
          }

          conversation.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }

        if (i === MAX_TOOL_ITERATIONS - 1) {
          finalText = 'Não consegui concluir a análise dentro do limite de consultas — tente reformular a pergunta de forma mais específica.';
        }
      }
    } catch (err: any) {
      return reply.status(500).send({ error: 'Erro ao consultar a IA: ' + err.message });
    }

    const assistantMessage = await prisma.aiChatMessage.create({
      data: {
        threadId,
        role: 'assistant',
        content: finalText,
        toolTrace: toolTrace.length ? (toolTrace as any) : undefined,
      },
    });

    await prisma.aiChatThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });

    return { message: assistantMessage };
  });

  // ── Knowledge (accumulated facts) ────────────────────────────────────────

  app.get('/ai-chat/knowledge', { preHandler: guard }, async () => {
    const facts = await prisma.aiKnowledge.findMany({ orderBy: { createdAt: 'desc' } });
    return { facts };
  });

  app.delete('/ai-chat/knowledge/:id', { preHandler: guard }, async (request) => {
    const { id } = request.params as { id: string };
    await prisma.aiKnowledge.delete({ where: { id } });
    return { success: true };
  });
}
